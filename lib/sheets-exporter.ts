// Оркестратор экспорта export_queue → Google Sheets (Этап 3).
// Инварианты приёмки:
// - сбой Google API не влияет на пользовательский запрос (экспорт идёт отдельным
//   процессом и только читает уже сохранённые события);
// - повторная отправка не создаёт дубли (dedupe по event_id из листа EVENTS);
// - в таблицу уходит только минимизированный payload (без текстов и имён).

import {
  claimExportBatch,
  markExportFailed,
  markExportSent,
  minimizePayloadForExport,
} from "./export-queue.ts";
import {
  buildCohortRow,
  buildDailyRow,
  buildEventRow,
  buildFeedbackRow,
  buildUserRow,
  SHEET_HEADERS,
  type ExportableEventRow,
  type SheetCell,
} from "./sheets-schema.ts";
import type { SheetsTransport } from "./google-sheets.ts";

export type SheetsExportResult = {
  claimed: number;
  sent: number;
  alreadySent: number;
  failed: number;
  deadLettered: number;
};

type QueueRow = {
  id: string;
  event_id: string;
  user_id: string;
};

async function loadEvents(
  db: D1Database,
  queueRows: QueueRow[],
): Promise<Map<string, ExportableEventRow>> {
  const map = new Map<string, ExportableEventRow>();
  for (const row of queueRows) {
    const event = await db
      .prepare(
        "SELECT id,user_id,session_id,trainer_id,day_index,event_name,payload_json,product_version,created_at FROM pilot_events WHERE id=?",
      )
      .bind(row.event_id)
      .first<ExportableEventRow>();
    if (event) map.set(row.event_id, event);
  }
  return map;
}

async function cohortKeyForUser(db: D1Database, userId: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT cohort_key FROM cohort_members WHERE user_id=?")
    .bind(userId)
    .first<{ cohort_key: string }>();
  return row?.cohort_key ?? null;
}

/** Пересчёт листов DAILY и COHORTS из D1 (snapshot-подход, пилотные объёмы). */
export async function buildSnapshotRows(db: D1Database): Promise<{
  daily: SheetCell[][];
  cohorts: SheetCell[][];
}> {
  const dailyRows = await db
    .prepare(
      `SELECT m.user_id, m.cohort_key, e.day_index,
              MAX(CASE WHEN e.event_name = 'engaged_return' THEN 1 ELSE 0 END) AS engaged,
              MAX(CASE WHEN e.event_name = 'action_started' THEN 1 ELSE 0 END) AS _s
       FROM cohort_members m
       JOIN pilot_events e ON e.user_id = m.user_id
       GROUP BY m.user_id, m.cohort_key, e.day_index
       ORDER BY m.cohort_key, m.user_id, e.day_index`,
    )
    .all<{ user_id: string; cohort_key: string; day_index: number; engaged: number }>();

  const actionStats = await db
    .prepare(
      `SELECT e.user_id, e.day_index,
              COUNT(DISTINCT CASE WHEN e.event_name = 'action_started' THEN e.id END) AS started,
              COUNT(DISTINCT CASE WHEN e.event_name IN ('action_completed','action_rated') THEN e.id END) AS completed
       FROM pilot_events e
       WHERE e.event_name IN ('action_started','action_completed','action_rated')
       GROUP BY e.user_id, e.day_index`,
    )
    .all<{ user_id: string; day_index: number; started: number; completed: number }>();
  const statsKey = new Map(
    actionStats.results.map((row) => [`${row.user_id}:${row.day_index}`, row]),
  );

  const daily = dailyRows.results.map((row) => {
    const stats = statsKey.get(`${row.user_id}:${row.day_index}`);
    return buildDailyRow({
      userId: row.user_id,
      cohortKey: row.cohort_key,
      dayIndex: Number(row.day_index),
      engaged: Number(row.engaged) === 1,
      actionsStarted: Number(stats?.started ?? 0),
      actionsCompleted: Number(stats?.completed ?? 0),
    });
  });

  const cohortStats = await db
    .prepare(
      `SELECT m.cohort_key, c.product_version,
              COUNT(DISTINCT m.user_id) AS users,
              COUNT(DISTINCT CASE WHEN e.day_index = 2 AND e.event_name = 'engaged_return' THEN e.user_id END) AS d2,
              COUNT(DISTINCT CASE WHEN e.day_index = 3 AND e.event_name = 'engaged_return' THEN e.user_id END) AS d3,
              COUNT(DISTINCT CASE WHEN e.day_index = 7 AND e.event_name = 'engaged_return' THEN e.user_id END) AS d7,
              COUNT(DISTINCT CASE WHEN e.event_name = 'action_started' THEN e.id END) AS started,
              COUNT(DISTINCT CASE WHEN e.event_name IN ('action_completed','action_rated') THEN e.id END) AS completed
       FROM cohort_members m
       JOIN cohorts c ON c.key = m.cohort_key
       LEFT JOIN pilot_events e ON e.user_id = m.user_id
       GROUP BY m.cohort_key
       ORDER BY m.cohort_key`,
    )
    .all<{
      cohort_key: string;
      product_version: string;
      users: number;
      d2: number;
      d3: number;
      d7: number;
      started: number;
      completed: number;
    }>();

  const cohorts = cohortStats.results.map((row) =>
    buildCohortRow({
      cohortKey: row.cohort_key,
      productVersion: row.product_version,
      users: Number(row.users),
      d2: Number(row.d2),
      d3: Number(row.d3),
      d7: Number(row.d7),
      actionsStarted: Number(row.started),
      actionsCompleted: Number(row.completed),
    }),
  );

  return { daily, cohorts };
}

/**
 * Экспортирует очередную порцию событий. Один прогон = claim batch → dedupe по
 * листу EVENTS → append EVENTS/FEEDBACK → upsert USERS → snapshot DAILY/COHORTS.
 * Любой сбой транспорта переводит всю порцию в failed с backoff; частичных
 * дублей не возникает, потому что повторный прогон отсекает уже записанные id.
 */
export async function runSheetsExport(
  db: D1Database,
  transport: SheetsTransport,
  input: { limit?: number; withSnapshots?: boolean } = {},
): Promise<SheetsExportResult> {
  const queueIds = await claimExportBatch(db, { limit: input.limit });
  const result: SheetsExportResult = {
    claimed: queueIds.length,
    sent: 0,
    alreadySent: 0,
    failed: 0,
    deadLettered: 0,
  };
  if (queueIds.length === 0) return result;

  const placeholders = queueIds.map(() => "?").join(",");
  const queueRows = (
    await db
      .prepare(`SELECT id, event_id, user_id FROM export_queue WHERE id IN (${placeholders})`)
      .bind(...queueIds)
      .all<QueueRow>()
  ).results;

  try {
    const events = await loadEvents(db, queueRows);
    await transport.ensureHeader("EVENTS", SHEET_HEADERS.EVENTS);
    const existingIds = new Set(await transport.readFirstColumn("EVENTS"));

    const eventRows: SheetCell[][] = [];
    const feedbackRows: SheetCell[][] = [];
    const toSend: QueueRow[] = [];
    const alreadySent: QueueRow[] = [];

    for (const row of queueRows) {
      if (existingIds.has(row.event_id)) {
        alreadySent.push(row);
        continue;
      }
      const event = events.get(row.event_id);
      if (!event) {
        // Событие отсутствует в D1 — экспортировать нечего, dead-letter сразу.
        await markExportFailed(db, row.id, "pilot event missing in D1");
        result.failed += 1;
        continue;
      }
      const cohortKey = (await cohortKeyForUser(db, event.user_id)) ?? "unassigned";
      const minimized = minimizePayloadForExport(event.payload_json);
      eventRows.push(buildEventRow(event, cohortKey, minimized));
      if (event.event_name === "feedback_submitted") {
        feedbackRows.push(buildFeedbackRow(event, cohortKey, minimized));
      }
      toSend.push(row);
    }

    await transport.appendRows("EVENTS", eventRows);
    await transport.ensureHeader("FEEDBACK", SHEET_HEADERS.FEEDBACK);
    await transport.appendRows("FEEDBACK", feedbackRows);

    // Upsert USERS: добавляем только тех, кого ещё нет в листе.
    await transport.ensureHeader("USERS", SHEET_HEADERS.USERS);
    const existingUsers = new Set(await transport.readFirstColumn("USERS"));
    const userRows: SheetCell[][] = [];
    for (const row of toSend) {
      if (existingUsers.has(row.user_id)) continue;
      existingUsers.add(row.user_id);
      const event = events.get(row.event_id)!;
      const cohortKey = (await cohortKeyForUser(db, row.user_id)) ?? "unassigned";
      userRows.push(
        buildUserRow({
          userId: row.user_id,
          cohortKey,
          trainerId: event.trainer_id,
          firstEventAt: event.created_at,
        }),
      );
    }
    await transport.appendRows("USERS", userRows);

    if (input.withSnapshots !== false) {
      const snapshot = await buildSnapshotRows(db);
      await transport.rewriteTab("DAILY", SHEET_HEADERS.DAILY, snapshot.daily);
      await transport.rewriteTab("COHORTS", SHEET_HEADERS.COHORTS, snapshot.cohorts);
    }

    const now = new Date().toISOString();
    for (const row of toSend) {
      await markExportSent(db, row.id, now);
      result.sent += 1;
    }
    for (const row of alreadySent) {
      // Дубль от прошлого частичного сбоя: событие уже в листе, просто закрываем.
      await markExportSent(db, row.id, now);
      result.alreadySent += 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    for (const row of queueRows) {
      const { deadLettered } = await markExportFailed(db, row.id, message);
      result.failed += 1;
      if (deadLettered) result.deadLettered += 1;
    }
  }
  return result;
}
