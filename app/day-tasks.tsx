"use client";
import { useEffect, useRef, useState } from "react";
import type { DayTask } from "@/lib/day-tasks";
import "./day-tasks.css";

export function DayTasks({ onHelp }: { onHelp: (title: string) => void }) {
  const [date, setDate] = useState("");
  const [timezone, setTimezone] = useState("");
  const [text, setText] = useState("");
  const [tasks, setTasks] = useState<DayTask[]>([]);
  const [busy, setBusy] = useState(false);
  const inflight = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const now = new Date();
      setTimezone(zone);
      setDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (!date) return;
    const controller = new AbortController();
    fetch(`/api/day-tasks?date=${encodeURIComponent(date)}`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const result = await response.json() as DayTask[] & { error?: string };
        if (!response.ok) throw new Error(result.error || "Не удалось открыть дела.");
        if (!controller.signal.aborted) { setTasks(result); setError(""); }
      }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Не удалось открыть дела."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [date, refresh]);
  async function mutate(body: Record<string, unknown>) {
    if (inflight.current) return false;
    inflight.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/day-tasks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
      const result = await response.json() as { error?: string; added: number; submitted: number };
      if (!response.ok) throw new Error(result.error || "Не удалось сохранить дело.");
      setNotice(body.action === "add" ? `Добавлено: ${result.added}. Пропущено повторов или дел сверх лимита 100 на дату: ${result.submitted - result.added}.` : "Изменения сохранены.");
      setLoading(true); setRefresh(value => value + 1);
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось сохранить. Обновите список перед повтором.");
      return false;
    } finally { inflight.current = false; setBusy(false); }
  }
  return <section className="trainer-panel day-tasks" aria-label="Дела на день" aria-busy={busy || loading}>
    <span className="trainer-kicker">ОДИН ПОСИЛЬНЫЙ ШАГ</span><h2>Дела на день</h2>
    <p>Можно сделать часть, перенести дело или выбрать одно для старта. Пропуск не обнуляет сделанное.</p>
    <div className="day-task-controls"><label>Дата дел<input aria-label="Дата дел" type="date" value={date} disabled={busy} onChange={event => { setDate(event.target.value); setTasks([]); setLoading(true); setNotice(""); }}/></label><label>Часовой пояс<input aria-label="Часовой пояс дел" value={timezone} maxLength={80} disabled={busy} onChange={event => setTimezone(event.target.value)}/></label></div>
    <form onSubmit={async event => { event.preventDefault(); if (await mutate({ action: "add", date, timezone, text })) setText(""); }}>
      <label className="trainer-label">Одно дело или список<textarea aria-label="Список дел" disabled={busy} className="trainer-input" value={text} maxLength={7500} onChange={event => setText(event.target.value)} placeholder="Каждое дело с новой строки, до 30 за раз"/></label>
      <button className="trainer-secondary" disabled={busy || loading || !date || !timezone || !text.trim()}>Добавить дела</button>
    </form>
    {error && <div role="alert"><p>{error}</p><button className="trainer-secondary" disabled={busy || !date} onClick={() => { setLoading(true); setRefresh(value => value + 1); }}>Обновить список дел</button></div>}
    {notice && <p role="status">{notice}</p>}
    {loading ? <p>Открываем дела…</p> : !error && !tasks.length && <p>На эту дату пока нет дел.</p>}
    {!loading && <div className="day-task-list">{tasks.map(task => <TaskRow key={`${task.id}:${task.version}`} task={task} timezone={timezone} disabled={busy} mutate={mutate} onHelp={onHelp}/>)}</div>}
    <a className="trainer-link" href="/api/day-tasks?export=1" download="skiller-day-tasks.json">Скачать все мои дела (JSON)</a>
    <small>Напоминания о делах пока не отправляются.</small>
  </section>;
}
function TaskRow({ task, timezone, disabled, mutate, onHelp }: { task: DayTask; timezone: string; disabled: boolean; mutate: (body: Record<string, unknown>) => Promise<boolean>; onHelp: (title: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [checked, setChecked] = useState(task.status === "done");
  const [title, setTitle] = useState(task.title);
  const [date, setDate] = useState(task.task_date);
  const update = (values: Record<string, unknown>) => mutate({ action: "update", id: task.id, version: task.version, title: task.title, date: task.task_date, timezone, status: task.status, ...values });
  return <article aria-label={`Дело: ${task.title}`} className={task.is_focus ? "day-task focus" : "day-task"}>
    <label className="day-task-check"><input type="checkbox" aria-label={`Выполнено: ${task.title}`} checked={checked} disabled={disabled} onChange={async event => { const next = event.target.checked; setChecked(next); if (!await update({ status: next ? "done" : "todo" })) setChecked(task.status === "done"); }}/><strong>{task.title}</strong></label>
    <p>{task.status === "done" ? "Сделано" : task.status === "partial" ? "Начато, но не закончено" : "Ещё не начато"}{task.is_focus ? " · Одно дело для старта" : ""}</p>
    <div className="day-task-actions">
      {task.status !== "done" && <><button className="trainer-secondary" disabled={disabled || Boolean(task.is_focus)} onClick={() => void mutate({ action: "focus", id: task.id, version: task.version })}>{task.is_focus ? "Выбрано для старта" : "Выбрать для старта"}</button><button className="trainer-secondary" disabled={disabled || task.status === "partial"} onClick={() => void update({ status: "partial" })}>Начал, но не закончил</button><button className="trainer-secondary" disabled={disabled} onClick={() => onHelp(task.title)}>Помоги начать</button></>}
      <button className="trainer-link" disabled={disabled} onClick={() => setEditing(!editing)}>Изменить или перенести</button>
    </div>
    {editing && <form onSubmit={async event => { event.preventDefault(); if (await update({ title, date })) setEditing(false); }}>
      <label>Название дела<input aria-label="Новое название дела" value={title} maxLength={240} onChange={event => setTitle(event.target.value)}/></label>
      <label>Перенести на дату<input aria-label="Перенести на дату" type="date" value={date} onChange={event => setDate(event.target.value)}/></label>
      <div className="day-task-actions"><button className="trainer-secondary" disabled={disabled || !title.trim() || !date}>Сохранить дело</button><button type="button" className="trainer-link" disabled={disabled} onClick={() => void mutate({ action: "delete", id: task.id, version: task.version })}>Удалить дело</button></div>
    </form>}
  </article>;
}
