"use client";
import { useEffect, useRef, useState } from "react";
import type { Reminder } from "@/lib/reminders";
export function remindersChanged() { window.dispatchEvent(new Event("skiller-reminders-changed")); }
export function ReminderSchedule({ taskId, timezone }: { taskId: string; timezone: string }) {
  const [open, setOpen] = useState(false), [localTime, setLocalTime] = useState(""), [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const inflight = useRef(false);
  return <div><button type="button" className="trainer-link" onClick={() => setOpen(!open)}>Напомнить об этом деле</button>{open && <form onSubmit={async event => {
    event.preventDefault(); if (inflight.current) return;
    inflight.current = true; setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/reminders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "schedule", taskId, timezone, localTime, consent }), signal: AbortSignal.timeout(15000) });
      const result = await response.json() as { error?: string; dueAt?: string };
      if (!response.ok) throw new Error(result.error || "Не удалось сохранить напоминание.");
      setMessage(`Напоминание сохранено: ${new Date(result.dueAt!).toLocaleString("ru", { timeZone: timezone })}, ${timezone}.`); remindersChanged(); setConsent(false);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось сохранить."); }
    finally { inflight.current = false; setBusy(false); }
  }}>
    <label>Когда проверить дело<input aria-label="Когда проверить дело" type="datetime-local" required value={localTime} disabled={busy} onChange={event => setLocalTime(event.target.value)}/></label>
    <p>Часовой пояс: {timezone}. Напоминание появится только при открытом SKILLER. При закрытом приложении уведомление не придёт.</p>
    <label className="day-task-check"><input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)}/>Разрешаю это разовое напоминание в приложении</label>
    <button className="trainer-secondary" disabled={busy || !consent || !localTime}>Подтвердить напоминание</button>
    {message && <p role="status">{message}</p>}
  </form>}</div>;
}
export function ReminderCenter({ onHelp }: { onHelp: (title: string) => void }) {
  const [items, setItems] = useState<Reminder[]>([]), [error, setError] = useState(""), [busy, setBusy] = useState(false), [refresh, setRefresh] = useState(0);
  const inflight = useRef(false);
  useEffect(() => {
    const update = () => setRefresh(value => value + 1);
    const timer = setInterval(() => { if (document.visibilityState === "visible") update(); }, 30000);
    window.addEventListener("focus", update); window.addEventListener("skiller-reminders-changed", update);
    return () => { clearInterval(timer); window.removeEventListener("focus", update); window.removeEventListener("skiller-reminders-changed", update); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/reminders", { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) { await response.text(); if (response.status === 503) { setItems([]); setError(""); return; } throw new Error("Не удалось открыть напоминания."); }
      const result = await response.json() as { items: Reminder[] };
      if (!controller.signal.aborted) { setItems(result.items); setError(""); }
    }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Не удалось открыть напоминания."); });
    return () => controller.abort();
  }, [refresh]);
  async function command(action: string, reminder?: Reminder) {
    if (inflight.current) return false;
    inflight.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/reminders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...(reminder ? { id: reminder.id, version: reminder.version } : {}) }), signal: AbortSignal.timeout(15000) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Не удалось изменить напоминание.");
      setRefresh(value => value + 1); return true;
    } catch (error) { setError(error instanceof Error ? error.message : "Не удалось сохранить."); return false; }
    finally { inflight.current = false; setBusy(false); }
  }
  async function answer(item: Reminder, status: "done" | "partial" | "todo") {
    if (inflight.current) return;
    inflight.current = true; setBusy(true); setError("");
    let taskSaved = false;
    try {
      const response = await fetch("/api/day-tasks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "update", id: item.task_id, version: item.task_version, title: item.title, date: item.task_date, timezone: item.task_timezone, status }), signal: AbortSignal.timeout(15000) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Не удалось сохранить ответ.");
      taskSaved = true;
      if (status !== "done") {
        const ack = await fetch("/api/reminders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "complete", id: item.id, version: item.version }), signal: AbortSignal.timeout(15000) });
        if (!ack.ok) { await ack.text(); throw new Error("Дело сохранено, но напоминание изменилось. Обновите список."); }
        await ack.json();
      }
      remindersChanged();
    } catch (error) { setError(taskSaved ? "Ответ о деле сохранён. Обновите напоминания перед следующим действием." : error instanceof Error ? error.message : "Не удалось сохранить ответ."); }
    finally { inflight.current = false; setBusy(false); setRefresh(value => value + 1); }
  }
  if (!items.length && !error) return null;
  return <section className="trainer-settings day-tasks" aria-label="Мои напоминания">
    <h2>Мои напоминания</h2><p>Только внутри открытого SKILLER. Проверяем расписание при открытии и каждые 30 секунд, пока вкладка видима.</p>
    {error && <p role="alert">{error}</p>}
    {items.map(item => <article className="day-task" key={`${item.id}:${item.version}`} aria-label={`Напоминание: ${item.title}`}>
      <strong>{item.due ? "Пора проверить дело" : "Запланировано"}</strong><p>{item.title}</p><p>{new Date(item.due_at).toLocaleString("ru", { timeZone: item.timezone })} · {item.timezone}</p>
      <div className="day-task-actions">{item.due && <><button className="trainer-secondary" disabled={busy} onClick={() => void answer(item, "done")}>Сделано</button><button className="trainer-secondary" disabled={busy} onClick={() => void answer(item, "partial")}>Начал, но не закончил</button><button className="trainer-secondary" disabled={busy} onClick={() => void answer(item, "todo")}>Ещё не начал</button></>}
      {item.due && <button className="trainer-secondary" disabled={busy} onClick={async () => { if (await command("complete", item)) onHelp(item.title); }}>Помоги начать</button>}
        <button className="trainer-secondary" disabled={busy} onClick={() => void command("snooze", item)}>Напомнить через час</button><button className="trainer-link" disabled={busy} onClick={() => void command("cancel", item)}>{item.due ? "Сегодня не надо" : "Отменить напоминание"}</button></div>
    </article>)}
    <button className="trainer-secondary" disabled={busy} onClick={() => void command("disableAll")}>Отключить все напоминания</button>
    <a className="trainer-link" href="/api/reminders?export=1" download="skiller-reminders.json">Скачать мои напоминания (JSON)</a>
    {error && <button className="trainer-link" onClick={() => setRefresh(value => value + 1)}>Обновить напоминания</button>}
  </section>;
}
