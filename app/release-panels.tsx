"use client";
import { z } from "zod";
import { useEffect, useState } from "react";

export function PrivacyPanel({ userId, onRequested }: { userId: string; onRequested: (id: string) => void }) {
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [receipt, setReceipt] = useState("");
  return <section className="trainer-panel" aria-label="Мои данные"><h3>Мои данные</h3>
    <p>Можно запросить удаление профиля, разговоров, результатов, памяти помощника и заявки на группу. Запрос обрабатывается вручную; до завершения очистки новые записи в этот профиль приостанавливаются.</p>
    <p><a className="trainer-link" href="/privacy">Как используются данные</a></p>
    {receipt ? <p role="status">Запрос принят, № {receipt}. Данные ещё не удалены. Сохраните номер для обращения к Ивану Василюку.</p> : <form onSubmit={async e => {
      e.preventDefault(); setBusy(true); setNotice("");
      try {
        const response = await fetch("/api/privacy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmation }) });
        const data = z.object({ error: z.string().optional(), request: z.object({ id: z.string() }).optional() }).parse(await response.json());
        if (!response.ok || !data.request) throw new Error(data.error || "Не удалось принять запрос.");
        // Erasure is now pending, not completed. Remove this browser's private drafts.
        try { localStorage.removeItem(`skiller-draft-v1:${encodeURIComponent(userId)}`); sessionStorage.removeItem("skiller-session"); } catch { /* Storage may be disabled. */ }
        setReceipt(data.request.id); onRequested(data.request.id);
      } catch (error) { setNotice(error instanceof Error ? error.message : "Попробуйте ещё раз."); }
      finally { setBusy(false); }
    }}><label className="trainer-label" htmlFor="erase-confirmation">Для подтверждения введите УДАЛИТЬ</label>
      <input id="erase-confirmation" className="trainer-input" value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off" maxLength={12}/>
      <button className="trainer-secondary" disabled={busy || confirmation !== "УДАЛИТЬ"}>{busy ? "Принимаем запрос…" : "Запросить удаление данных"}</button>
    </form>}{notice && <p role="alert">{notice}</p>}</section>;
}

export function GroupOffer({ revision }: { revision: string }) {
  const [eligible, setEligible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [contact, setContact] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [application, setApplication] = useState<{ id: string; status: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/group-requests").then(async r => r.ok ? z.object({ eligible: z.boolean(), request: z.object({ id: z.string(), status: z.string() }).nullable().optional() }).parse(await r.json()) : { eligible: false, request: null }).then(data => {
      if (!cancelled) { setEligible(data.eligible === true); setApplication(data.request ?? null); }
    }).catch(() => { if (!cancelled) setEligible(false); });
    return () => { cancelled = true; };
  }, [revision]);
  if (!eligible) return null;
  return <section className="trainer-panel" aria-label="Группа СДВГ"><h2>Продолжить практику в группе?</h2>
    <p>Группа для взрослых с СДВГ с психологом Иваном Василюком. Можно уточнить программу, расписание и стоимость. Заявка бесплатна и ни к чему не обязывает; места, условия и оплата согласуются лично.</p>
    {application ? <p role="status">{application.status === "confirmed" ? "Оплата и участие подтверждены организатором." : application.status === "contacted" ? "Организатор связался с Вами. Условия участия согласуются лично." : application.status === "closed" ? "Заявка закрыта организатором." : "Заявка получена. Организатор свяжется по указанному контакту; оплата пока не подтверждена."} Номер: {application.id}</p> : expanded ? <form onSubmit={async e => {
      e.preventDefault(); setBusy(true); setNotice("");
      try {
        const response = await fetch("/api/group-requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contact, consent }) });
        const data = z.object({ error: z.string().optional(), id: z.string().optional(), status: z.string().optional() }).parse(await response.json()); if (!response.ok || !data.id || !data.status) throw new Error(data.error || "Заявка не отправлена."); setApplication({ id: data.id, status: data.status });
      } catch (error) { setNotice(error instanceof Error ? error.message : "Попробуйте ещё раз."); } finally { setBusy(false); }
    }}><label className="trainer-label" htmlFor="group-contact">Telegram или email для ответа</label>
      <input id="group-contact" className="trainer-input" value={contact} maxLength={160} onChange={e => setContact(e.target.value)} autoComplete="off"/>
      <label className="trainer-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/><span>Согласен передать контакт Ивану Василюку для ответа по этой заявке. Тексты разговоров помощника не передаются в заявку.</span></label>
      <button className="trainer-secondary" disabled={busy || !consent || contact.trim().length < 3}>{busy ? "Отправляем…" : "Оставить заявку на группу"}</button>
    </form> : <button className="trainer-secondary" onClick={() => setExpanded(true)}>Узнать о группе СДВГ</button>}{notice && <p role="alert">{notice}</p>}</section>;
}
