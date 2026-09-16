// Cohort attribution пользователя (Этап 3, задача «Добавить cohorts и cohort attribution»).
// Cohort присваивается один раз при первом сохранённом pilot event и дальше не меняется:
// ключ — UTC-день первого события плюс product version, поэтому решение воспроизводимо
// по сохранённым данным и не требует ручной разметки.

import { PRODUCT_VERSION } from "./trainers.ts";

export function cohortKeyFor(firstEventAt: string, productVersion: string = PRODUCT_VERSION): string {
  const day = firstEventAt.slice(0, 10);
  return `${day}:${productVersion}`;
}

export async function ensureCohortAttribution(
  db: D1Database,
  input: { userId: string; firstEventAt: string; now?: string },
): Promise<{ cohortKey: string }> {
  const cohortKey = cohortKeyFor(input.firstEventAt);
  const now = input.now ?? new Date().toISOString();
  await db
    .prepare("INSERT OR IGNORE INTO cohorts (key, product_version, starts_on, created_at) VALUES (?,?,?,?)")
    .bind(cohortKey, PRODUCT_VERSION, cohortKey.slice(0, 10), now)
    .run();
  await db
    .prepare("INSERT OR IGNORE INTO cohort_members (cohort_key, user_id, first_event_at, created_at) VALUES (?,?,?,?)")
    .bind(cohortKey, input.userId, input.firstEventAt, now)
    .run();
  return { cohortKey };
}
