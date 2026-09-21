"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, ArrowLeft, Check, MessageCircle, Mic, MicOff, Play, Settings2, Sparkles, X } from "lucide-react";
import { trainers, interactionModes, type TrainerId, type EntryMode } from "@/lib/trainers";
import type { TrainerState, TrainerPlan } from "@/lib/trainer-data";
import { explainDecisionReason } from "@/lib/trainer-continuity";
import type { SkillView } from "@/lib/skiller-data";
import "./trainer.css";

const entries: { id: EntryMode; title: string; copy: string; mark: string }[] = [
  { id: "practice", title: "Потренироваться", copy: "Небольшая практика для реальной жизни", mark: "↗" },
  { id: "stuck", title: "Я застрял", copy: "Найдём первый посильный шаг", mark: "→" },
  { id: "distress", title: "Меня накрыло", copy: "Сначала вернём немного опоры", mark: "≈" },
  { id: "talk", title: "Просто поговорить", copy: "Можно начать с того, что на уме", mark: "••" },
];
const trainerIntroductions: Record<TrainerId, { label: string; quote: string; method: string; fit: string }> = {
  marsha: {
    label: "Бережная опора",
    quote: "Похоже, сейчас и так много давления. Давай не требовать от себя всего сразу и найдём один шаг, который по силам.",
    method: "DBT/CFT: сначала помогает вернуть опору, затем мягко переводит к действию.",
    fit: "Когда важно, чтобы рядом было тепло, спокойно и без стыда.",
  },
  beck: {
    label: "Спокойный анализ",
    quote: "Отделим то, что произошло, от того, что ты об этом подумал. Какой маленький эксперимент может проверить эту мысль?",
    method: "CBT и функциональный анализ: разбирает факты и гипотезы, предлагает проверяемый эксперимент.",
    fit: "Когда хочется понять закономерность и принимать решения яснее.",
  },
  skinny: {
    label: "Импульс к действию",
    quote: "Всю задачу сегодня не тащим. Что можно сделать за две минуты, чтобы после тебя остался видимый след?",
    method: "Поведенческая активация и ADHD-навыки: превращает намерение в конкретный микро-старт.",
    fit: "Когда всё понятно, но сложно начать или не отвлечься.",
  },
};
export function TrainerApp({ initialState }: { initialState: TrainerState }) {
  const [state, setState] = useState(initialState);
  const [screen, setScreen] = useState<"home" | "conversation" | "trainers" | "journal" | "recap">("home");
  const [mode, setMode] = useState<EntryMode>("stuck");
  const [settings, setSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [name, setName] = useState("");
  const [trainerId, setTrainerId] = useState<TrainerId>("marsha");
  const [step, setStep] = useState(0);
  const [consent, setConsent] = useState(false);
  const [text, setText] = useState("");
  const [intensity, setIntensity] = useState(5);
  const [risk, setRisk] = useState("unknown");
  const [kind, setKind] = useState("stuck");
  const [signal, setSignal] = useState("thought");
  const [urge, setUrge] = useState("avoid");
  const messagesRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef("");
  const inflight = useRef(false);
  // PATCH 1.1 (voice parity): микрофон → транскрипция → тот же text pipeline.
  const [recording, setRecording] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const profile = state.profile;
  const trainer = trainers[profile?.trainer_id ?? trainerId];
  const pending = state.plans.find(p => !p.result);
  const latest = state.plans.find(p => p.result);
  const openLoop = state.continuity.openLoop;
  const day2CheckIn = state.continuity.day2CheckIn;
  const days4to6 = state.continuity.days4to6;
  const gapReturn = state.continuity.gapReturn;
  const [feedback, setFeedback] = useState({ helpfulness: 5, understood: 5, continueIntent: 5, helped: "", annoyed: "" });
  const [feedbackSaved, setFeedbackSaved] = useState(false);

  async function command(payload: Record<string, unknown>) {
    if (inflight.current) return null;
    inflight.current = true; setBusy(true); setError("");
    if (!sessionRef.current) sessionRef.current = crypto.randomUUID();
    try {
      const response = await fetch("/api/trainer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, requestId: crypto.randomUUID(), sessionId: sessionRef.current }), signal: AbortSignal.timeout(25000) });
      const result = await response.json() as TrainerState & { error?: string };
      if (!response.ok) throw new Error(result.error || "Не удалось сохранить");
      setState(result); return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить. Попробуйте обновить данные.");
      return null;
    } finally { inflight.current = false; setBusy(false); }
  }
  // Автопрокрутка к последнему сообщению / индикатору typing.
  useEffect(() => {
    const node = messagesRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [state.messages.length, busy, screen]);
  useEffect(() => {
    sessionRef.current = sessionStorage.getItem("skiller-session") || crypto.randomUUID();
    sessionStorage.setItem("skiller-session", sessionRef.current);
    if (initialState.profile) void command({ action: "open" });
    // Log once per browser session; backend deduplicates the event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function refresh() {
    try { const response = await fetch("/api/trainer", { cache: "no-store" }); if (!response.ok) throw new Error(); setState(await response.json()); setError(""); }
    catch { setError("Сервер недоступен. Попробуйте ещё раз позже."); }
  }
  function enter(value: EntryMode) { setMode(value); setKind(value === "distress" ? "emotion" : "stuck"); setRisk("unknown"); setScreen("conversation"); }
  async function send() {
    const result = await command({ action: mode === "talk" ? "message" : "situation", text, mode, kind, signal, urge, intensity, risk });
    if (result) setText("");
  }
  function stopVoiceStream() {
    voiceStreamRef.current?.getTracks().forEach((t) => t.stop());
    voiceStreamRef.current = null;
  }
  async function toggleRecording() {
    setVoiceError("");
    if (recording) { mediaRecorderRef.current?.stop(); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setVoiceError("Браузер не поддерживает запись. Можно написать текстом.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      voiceChunksRef.current = [];
      voiceStreamRef.current = stream;
      mediaRecorderRef.current = rec;
      rec.ondataavailable = (e) => { if (e.data.size) voiceChunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stopVoiceStream();
        setRecording(false);
        const blob = new Blob(voiceChunksRef.current, { type: mimeType || "audio/webm" });
        if (!blob.size) return;
        // Транскрипция через тот же /api/skiller, затем текст в общий composer pipeline.
        try {
          const form = new FormData();
          form.set("action", "transcribe");
          form.set("audio", blob, "voice.webm");
          const res = await fetch("/api/skiller", { method: "POST", body: form });
          const data = await res.json() as { text?: string; error?: string };
          if (!res.ok) throw new Error(data.error || "Не удалось расшифровать");
          setText((prev) => (prev ? `${prev} ` : "") + (data.text ?? ""));
          await command({ action: "message", text: data.text ?? "", mode: "talk" });
        } catch (err) {
          setVoiceError(err instanceof Error ? err.message : "Ошибка транскрипции");
        }
      };
      rec.start();
      setRecording(true);
    } catch {
      setVoiceError("Доступ к микрофону не получен. Можно продолжить текстом.");
      stopVoiceStream();
    }
  }
  async function onboard() {
    const result = await command({ action: "onboard", name, trainerId, text, consent });
    if (result) { setScreen("conversation"); setMode("stuck"); }
  }
  async function showRecap() {
    const result = await command({ action: "recap", recapDay: state.day >= 7 ? 7 : 3 });
    if (result) setScreen("recap");
  }
  function showTrainers() {
    if (profile) setTrainerId(profile.trainer_id);
    setSettings(false);
    setScreen("trainers");
  }
  async function saveTrainer() {
    const selectedName = trainers[trainerId].name;
    const result = await command({ action: "settings", trainerId });
    if (result) {
      setNotice(`Теперь с тобой ${selectedName}. Текущая задача, память и прогресс сохранены.`);
      setScreen("home");
    }
  }
  function resumeOpenLoop() {
    if (!openLoop) return;
    setMode(openLoop.entryMode as EntryMode);
    setScreen("conversation");
  }
  function resumeDay2CheckIn() {
    if (!day2CheckIn) return;
    setMode(day2CheckIn.entryMode as EntryMode);
    setScreen("conversation");
  }
  function startDays4to6Step() {
    if (!days4to6) return;
    setMode(days4to6.entryMode as EntryMode);
    setScreen("conversation");
  }
  function resumeAfterGap() {
    if (!gapReturn) return;
    setMode(gapReturn.entryMode as EntryMode);
    setScreen("conversation");
  }
  // PATCH 1.1: быстрый ответ на follow-up по due open loop (DONE/PARTIAL/NOT_DONE/SKILL_REJECTED).
  async function answerOutcome(result: string) {
    const loop = state.dueLoop;
    if (!loop?.plan_id) return;
    if (result === "skill_rejected") {
      await command({ action: "message", text: "Не подошло. Расскажи, что не так — подберу другое.", mode: "talk" });
      return;
    }
    const mapped = result === "done" ? "done" : result === "partial" ? "partial" : "failed";
    await command({ action: "outcome", planId: loop.plan_id, result: mapped, helpfulness: result === "done" ? 8 : 4, intensity });
  }

  return <div className="trainer-shell" style={{ "--trainer-color": trainer.color, "--trainer-bg": trainer.background } as React.CSSProperties}>
    <header className="trainer-header"><Link className="trainer-logo" href="/">skiller<span>●</span></Link><span className="trainer-header-note">маленькие действия · реальные изменения</span>{profile && <button className="trainer-icon-button" aria-label="Настройки тренера" onClick={() => setSettings(!settings)}><Settings2 size={21}/></button>}</header>
    {error && <div className="trainer-error" role="alert">{error}<button onClick={refresh}>Обновить данные</button></div>}
    {notice && <div className="trainer-notice" role="status">{notice}<button aria-label="Закрыть уведомление" onClick={() => setNotice("")}><X size={16}/></button></div>}
    {!profile ? <main className="trainer-onboarding">
      <span className="trainer-kicker">ЗНАКОМСТВО / {step + 1} ИЗ 3</span>
      {step === 0 && <><h1>Начнём с тебя.</h1><p className="trainer-lead">Не нужно менять всё сразу.<br/>Найдём один шаг, который сейчас по силам.</p><label className="trainer-label" htmlFor="your-name">Как к тебе обращаться?</label><input id="your-name" className="trainer-input" autoComplete="given-name" maxLength={60} value={name} onChange={e => setName(e.target.value)} placeholder="Твоё имя"/><button className="trainer-primary" disabled={!name.trim()} onClick={() => setStep(1)}>Познакомиться с тренерами <ArrowUpRight size={18}/></button><p className="trainer-caption">SKILLER — AI-тренировка навыков, не психотерапия и не экстренная помощь.</p></>}
      {step === 1 && <section className="trainer-meet"><div className="trainer-meet-heading"><div><h1>С кем тебе по пути?</h1><p className="trainer-lead">У каждого свой характер, но правила одни: без оценок личности, давления и пустых обещаний.</p></div><span className="trainer-meet-note">Тренера можно сменить позже.<br/>Прогресс сохранится.</span></div><div className="trainer-intro-grid" role="radiogroup" aria-label="Выберите AI-тренера">{Object.entries(trainers).map(([id, item]) => { const typedId = id as TrainerId; const intro = trainerIntroductions[typedId]; const selected = trainerId === typedId; return <button key={id} type="button" role="radio" aria-checked={selected} onClick={() => setTrainerId(typedId)} className={`trainer-intro-card ${selected ? "selected" : ""}`} style={{ "--card-color": item.color, "--card-bg": item.background } as React.CSSProperties}><span className="trainer-intro-top"><span className="trainer-intro-label">{intro.label}</span>{selected && <span className="trainer-selected-mark"><Check size={14}/> Выбран</span>}</span><span className="trainer-intro-portrait" aria-hidden="true"><span>{item.symbol}</span></span><strong>{item.name}</strong><small>{item.title}</small><span className="trainer-intro-copy">{item.description}</span></button>; })}</div><section className="trainer-voice-preview" style={{ "--preview-color": trainer.color, "--preview-bg": trainer.background } as React.CSSProperties} aria-live="polite"><div className="trainer-voice-person"><span className="trainer-avatar small" style={{ background: trainer.background, color: trainer.color }}>{trainer.symbol}</span><span><small>КАК ЭТО ЗВУЧИТ</small><strong>{trainer.name}</strong></span></div><blockquote>«{trainerIntroductions[trainerId].quote}»</blockquote><div className="trainer-voice-details"><p><strong>Как работает</strong>{trainerIntroductions[trainerId].method}</p><p><strong>Подойдёт, если</strong>{trainerIntroductions[trainerId].fit}</p></div></section><div className="trainer-actions trainer-meet-actions"><button className="trainer-secondary" onClick={() => setStep(0)}><ArrowLeft size={17}/> Назад</button><button className="trainer-primary" onClick={() => setStep(2)}>Продолжить с {trainer.name === "Марша" ? "Маршей" : trainer.name === "Бек" ? "Беком" : "Скинни"} <ArrowUpRight size={18}/></button></div></section>}
      {step === 2 && <><div className="trainer-avatar small">{trainer.symbol}</div><h1>{name}, привет.</h1><p className="trainer-lead">{trainer.greeting}</p><label className="trainer-label" htmlFor="first-story">Что сейчас реально мешает?</label><textarea id="first-story" className="trainer-input" rows={4} maxLength={1200} value={text} onChange={e => setText(e.target.value)} placeholder="Например: весь день откладываю начало отчёта и открываю новости."/><label className="trainer-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/><span>Согласен на сохранение ситуаций и результатов в моём профиле и обработку сообщений AI. Для пилота используются обезличенные события, без текста разговоров. Понимаю границы самостоятельной практики.</span></label><div className="trainer-actions"><button className="trainer-secondary" onClick={() => setStep(1)}>Назад</button><button className="trainer-primary" disabled={busy || !consent || text.trim().length < 5} onClick={onboard}>{busy ? "Сохраняем…" : "Начать знакомство"}<ArrowUpRight size={18}/></button></div></>}
    </main> : <>
      <nav className="trainer-nav" aria-label="Основная навигация"><button aria-current={screen === "home" ? "page" : undefined} onClick={() => setScreen("home")}>Мой тренер</button><button aria-current={screen === "conversation" ? "page" : undefined} onClick={() => enter("talk")}>Разговор</button><button aria-current={screen === "trainers" ? "page" : undefined} onClick={showTrainers}>Тренеры</button><button aria-current={screen === "journal" ? "page" : undefined} onClick={() => setScreen("journal")}>Моя неделя</button><span>День {state.day}</span></nav>
      {settings && <section className="trainer-settings"><div className="trainer-row"><h2>Как будем общаться?</h2><button className="trainer-icon-button" aria-label="Закрыть настройки" onClick={() => setSettings(false)}><X/></button></div><p>Прогресс и память сохраняются при смене тренера.</p><button className="trainer-secondary" onClick={showTrainers}>Познакомиться с тренерами</button><div className="trainer-actions">{Object.entries(interactionModes).map(([id, label]) => <button disabled={busy} aria-pressed={profile.interaction_mode === id} className="trainer-secondary" key={id} onClick={() => command({ action: "settings", interactionMode: id })}>{label}</button>)}</div></section>}
      <main className="trainer-main">
        {screen === "home" && <><div className="trainer-home-heading"><span className="trainer-kicker">ТВОЁ МЕСТО ДЛЯ ПРАКТИКИ</span><span className="trainer-day">НЕДЕЛЯ С ТРЕНЕРОМ · {Math.min(state.day, 7)}/7</span></div><section className="trainer-hero"><div><span className="trainer-kicker">{trainer.name.toUpperCase()} · ТВОЙ AI-ТРЕНЕР</span><h1>{profile.name},<br/>{state.plans.length ? "продолжим?" : "давай начнём."}</h1><p>{latest ? `В прошлый раз: «${latest.skill_title}» — ${latest.result === "failed" ? "не получилось" : latest.result === "more" ? "сделано больше" : "получилось"}. ${trainer.return}` : trainer.greeting}</p><button className="trainer-primary" onClick={() => enter(pending ? pending.entry_mode as EntryMode : "stuck")}>{pending ? "Продолжить практику" : "Найти первый шаг"}<ArrowUpRight size={20}/></button></div><div className="trainer-portrait" aria-label={trainer.name}><div className="trainer-orbit"/><div className="trainer-avatar">{trainer.symbol}</div><span>{trainer.name}</span><small>{trainer.title}</small></div></section>{gapReturn ? <section className="trainer-panel"><span className="trainer-kicker">ВОЗВРАЩЕНИЕ БЕЗ СБРОСА</span><h2>{gapReturn.skillTitle ?? "Продолжим с текущей точки"}</h2><p>{gapReturn.prompt}</p><button className="trainer-primary" onClick={resumeAfterGap}>{gapReturn.actionLabel}<ArrowUpRight size={17}/></button></section> : day2CheckIn ? <section className="trainer-panel"><span className="trainer-kicker">ДЕНЬ 2 · ПРОВЕРЯЕМ ФАКТ</span><h2>{day2CheckIn.skillTitle}</h2><p>{day2CheckIn.prompt}</p><button className="trainer-primary" onClick={resumeDay2CheckIn}>{day2CheckIn.actionLabel}<ArrowUpRight size={17}/></button></section> : days4to6 ? <section className="trainer-panel"><span className="trainer-kicker">ДЕНЬ {state.day} · СЛЕДУЮЩИЙ ЭКСПЕРИМЕНТ</span><h2>{days4to6.skillTitle}</h2><p>{days4to6.prompt}</p><p className="trainer-decision-reason"><strong>Почему такой шаг</strong><span>{days4to6.reasonExplanation}</span></p><button className="trainer-primary" onClick={startDays4to6Step}>{days4to6.actionLabel}<ArrowUpRight size={17}/></button></section> : openLoop && <section className="trainer-panel"><span className="trainer-kicker">ПРОДОЛЖАЕМ С СОХРАНЁННОГО МЕСТА</span><h2>{openLoop.skillTitle}</h2><p>{openLoop.prompt}</p><button className="trainer-primary" onClick={resumeOpenLoop}>{openLoop.actionLabel}<ArrowUpRight size={17}/></button></section>}<div className="trainer-section-title"><h2>Что тебе сейчас нужно?</h2><span>Любая точка — подходящее начало</span></div><div className="trainer-entry-grid">{entries.map(entry => <button key={entry.id} className="trainer-entry" onClick={() => enter(entry.id)}><span className="trainer-entry-mark">{entry.mark}</span><strong>{entry.title}</strong><p>{entry.copy}</p><ArrowUpRight size={19}/></button>)}</div><section className="trainer-week-strip"><div><span className="trainer-kicker">ТВОЯ НЕДЕЛЯ</span><p>Возвращаться можно без идеального графика.</p></div><div className="trainer-days">{[1, 2, 3, 4, 5, 6, 7].map(d => <span key={d} className={state.engagedDays.includes(d) ? "engaged" : ""} title={`День ${d}${state.engagedDays.includes(d) ? ": было взаимодействие" : ""}`}>{state.engagedDays.includes(d) ? <Check size={15}/> : d}</span>)}</div>{state.day >= 3 && <button className="trainer-link" onClick={showRecap}>Посмотреть итог <ArrowUpRight size={16}/></button>}</section></>}
        {screen === "trainers" && <section className="trainer-meet"><div className="trainer-meet-heading"><div><span className="trainer-kicker">ВЫБОР AI-ТРЕНЕРА</span><h1>С кем тебе по пути?</h1><p className="trainer-lead">Послушай голос каждого и выбери характер, с которым хочется продолжить.</p></div><span className="trainer-meet-note">Прогресс и память сохранятся<br/>при смене тренера.</span></div><div className="trainer-intro-grid" role="radiogroup" aria-label="Выберите AI-тренера">{Object.entries(trainers).map(([id, item]) => { const typedId = id as TrainerId; const intro = trainerIntroductions[typedId]; const selected = trainerId === typedId; return <button key={id} type="button" role="radio" aria-checked={selected} onClick={() => setTrainerId(typedId)} className={`trainer-intro-card ${selected ? "selected" : ""}`} style={{ "--card-color": item.color, "--card-bg": item.background } as React.CSSProperties}><span className="trainer-intro-top"><span className="trainer-intro-label">{intro.label}</span>{selected && <span className="trainer-selected-mark"><Check size={14}/> Выбран</span>}</span><span className="trainer-intro-portrait" aria-hidden="true"><span>{item.symbol}</span></span><strong>{item.name}</strong><small>{item.title}</small><span className="trainer-intro-copy">{item.description}</span></button>; })}</div><section className="trainer-voice-preview" style={{ "--preview-color": trainers[trainerId].color, "--preview-bg": trainers[trainerId].background } as React.CSSProperties} aria-live="polite"><div className="trainer-voice-person"><span className="trainer-avatar small" style={{ background: trainers[trainerId].background, color: trainers[trainerId].color }}>{trainers[trainerId].symbol}</span><span><small>КАК ЭТО ЗВУЧИТ</small><strong>{trainers[trainerId].name}</strong></span></div><blockquote>«{trainerIntroductions[trainerId].quote}»</blockquote><div className="trainer-voice-details"><p><strong>Как работает</strong>{trainerIntroductions[trainerId].method}</p><p><strong>Подойдёт, если</strong>{trainerIntroductions[trainerId].fit}</p></div></section><div className="trainer-actions trainer-meet-actions"><button className="trainer-secondary" onClick={() => setScreen("home")}><ArrowLeft size={17}/> Назад</button><button className="trainer-primary" disabled={busy || trainerId === profile.trainer_id} onClick={saveTrainer}>{busy ? "Сохраняем…" : trainerId === profile.trainer_id ? `${trainers[trainerId].name} уже выбран` : `Выбрать: ${trainers[trainerId].name}`}<ArrowUpRight size={18}/></button></div></section>}
        {screen === "conversation" && <><button className="trainer-link" onClick={() => setScreen("home")}><ArrowLeft size={16}/> К тренеру</button><div className="trainer-conversation-title"><div className="trainer-avatar small">{trainer.symbol}</div><div><h1>{mode === "talk" ? "Просто поговорим" : entries.find(e => e.id === mode)?.title}</h1><p>{trainer.name} · {interactionModes[profile.interaction_mode]} · <span className="trainer-online"><span className="trainer-online-dot" aria-hidden="true"/>на связи</span></p></div><span className="trainer-today">Сегодня · День {state.day}</span></div>
        {state.dueLoop && <section className="trainer-followup"><span className="trainer-kicker">ПРОДОЛЖАЕМ ВЧЕРАШНЕЕ</span><p>Возвращаюсь к договорённости: «{state.dueLoop.topic}» → {state.dueLoop.planned_action}.</p><div className="trainer-quickreplies" role="group" aria-label="Быстрый ответ о результате">{[["done","Получилось"],["partial","Частично"],["not_done","Не сделал"],["skill_rejected","Не подошло"]].map(([r,label]) => <button key={r} type="button" className="trainer-chip" disabled={busy} onClick={() => void answerOutcome(r as string)}>{label}</button>)}</div></section>}
        <div className="trainer-messages" ref={messagesRef} aria-live="polite">{state.messages.slice(-8).map(m => <div key={m.id} className={`trainer-message ${m.role}`}><small>{m.role === "user" ? profile.name : trainers[m.trainer_id].name}</small><p>{m.text}</p></div>)}{busy && <div className="trainer-message assistant" aria-live="polite"><small>{trainer.name}</small><p className="trainer-typing" aria-label="Тренер печатает"><span/><span/><span/></p></div>}</div>
          {Boolean(profile.safety_flag) ? <section className="trainer-safety"><h2>Сначала — безопасность</h2><p>Практика приостановлена. Если непосредственная опасность миновала, можно снова оценить состояние.</p><button disabled={busy} className="trainer-secondary" onClick={() => command({ action: "safeAgain", risk: "no" })}>Сейчас нет риска причинить вред</button></section> : <>
          {pending && <PlanCard key={pending.id} plan={pending} busy={busy} command={command}/>}
          {!pending && latest?.result === "failed" && <section className="trainer-panel"><h2>Изменим размер шага?</h2><p>{trainer.failure}</p><div className="trainer-actions"><button disabled={busy} className="trainer-secondary" onClick={() => command({ action: "resize", planId: latest.id })}>Упростить до первого шага</button><button disabled={busy} className="trainer-secondary" onClick={() => command({ action: "replace", planId: latest.id })}>Попробовать другой навык</button></div></section>}
          <form className="trainer-composer" onSubmit={e => { e.preventDefault(); void send(); }}><label className="trainer-label" htmlFor="message">{mode === "talk" ? "Что у тебя на уме?" : "Один конкретный эпизод"}</label><textarea id="message" rows={3} className="trainer-input" maxLength={1200} value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder="Можно начать с пары предложений…"/>
          {mode !== "talk" && <div className="trainer-capture"><label htmlFor="capture-kind">Ситуация<select id="capture-kind" value={kind} onChange={e => setKind(e.target.value)}><option value="stuck">Не могу начать</option><option value="emotion">Сильная эмоция</option><option value="conflict">Конфликт</option><option value="other">Другое</option></select></label><label htmlFor="capture-signal">Что первым замечаешь?<select id="capture-signal" value={signal} onChange={e => setSignal(e.target.value)}><option value="thought">Мысль</option><option value="body">Ощущение в теле</option><option value="emotion">Эмоцию</option><option value="urge">Импульс</option></select></label><label htmlFor="capture-urge">Что хочется сделать?<select id="capture-urge" value={urge} onChange={e => setUrge(e.target.value)}><option value="avoid">Отложить / замереть</option><option value="distract">Отвлечься</option><option value="attack">Спорить / доказывать</option><option value="withdraw">Уйти / закрыться</option></select></label><Score label="Интенсивность сейчас" value={intensity} onChange={setIntensity}/><label className="trainer-risk" htmlFor="capture-risk">Есть риск причинить вред себе или другому?<select id="capture-risk" value={risk} onChange={e => setRisk(e.target.value)}><option value="unknown">Выбери ответ</option><option value="no">Нет</option><option value="yes">Да / не уверен</option></select></label></div>}
          <div className="trainer-row"><span className="trainer-caption">{mode === "talk" ? "Можно говорить, не переходя к упражнению." : "Сначала проверим состояние, затем предложим шаг."}</span><div className="trainer-row" style={{gap:8}}><button type="button" aria-label={recording ? "Остановить запись" : "Записать голосом"} aria-pressed={recording} className="trainer-icon-button" onClick={() => void toggleRecording()}>{recording ? <MicOff size={18}/> : <Mic size={18}/>}</button><button className="trainer-primary" disabled={busy || text.trim().length < 3 || (mode !== "talk" && risk === "unknown") || (mode !== "talk" && Boolean(pending))}>{busy ? "Подождём ответ…" : mode === "talk" ? "Отправить" : "Подобрать шаг"}<ArrowUpRight size={17}/></button></div></div>{voiceError && <p className="trainer-caption" role="status">{voiceError}</p>}</form><div className="trainer-actions"><button className="trainer-link" onClick={() => enter("talk")}><MessageCircle size={16}/> Продолжить разговор</button><button className="trainer-link" onClick={() => enter("stuck")}>Разобрать ситуацию</button><button className="trainer-link" onClick={() => enter("distress")}>Помочь с состоянием</button></div></>}
        </>}
        {screen === "journal" && <><span className="trainer-kicker">ПАМЯТЬ О РЕАЛЬНЫХ ПОПЫТКАХ</span><h1>Твоя неделя.</h1><p className="trainer-lead">{state.recap.attempts} попыток · {state.recap.completed} выполненных действий</p>{state.day >= 3 && <button className="trainer-primary" onClick={showRecap}>Итог {state.day >= 7 ? "недели" : "трёх дней"}<Sparkles size={17}/></button>}<div className="trainer-history">{state.plans.length ? state.plans.map(p => <article key={p.id}><span>{new Date(p.created_at).toLocaleDateString("ru")}</span><h3>{p.skill_title}</h3><p>{p.result === "done" ? "Получилось" : p.result === "more" ? "Сделано больше" : p.result === "failed" ? "Не получилось — можно уменьшить шаг" : p.attempt_id ? "Практика начата" : "Шаг предложен"}</p>{p.helpfulness !== null && <small>Оценка пользы: {p.helpfulness}/10</small>}</article>) : <p>Здесь появятся твои попытки. Начать можно с одного маленького действия.</p>}</div><a className="trainer-link" href="/journal">Открыть прежнюю карту навыков <ArrowUpRight size={16}/></a></>}
        {screen === "recap" && <><span className="trainer-kicker">{trainer.name.toUpperCase()} · ИТОГ {state.day >= 7 ? "НЕДЕЛИ" : "ТРЁХ ДНЕЙ"}</span><h1>Что мы заметили.</h1><p className="trainer-lead">Только сохранённые попытки. Без оценок твоей личности.</p><div className="trainer-recap-stats"><div><strong>{state.recap.proposed}</strong><span>действий предложено</span></div><div><strong>{state.recap.attempts}</strong><span>реальных попыток</span></div><div><strong>{state.recap.outcomesRecorded}</strong><span>результатов отмечено</span></div><div><strong>{state.recap.engagedDays.length}</strong><span>дней с взаимодействием</span></div></div><section className="trainer-panel"><h2>Сохранённые факты</h2><p>{state.recap.facts.join(" ") || "Пока нет сохранённых действий и результатов."}</p></section>{state.day >= 7 && <><section className="trainer-panel"><span className="trainer-kicker">РАБОЧАЯ ГИПОТЕЗА</span><h2>{state.recap.day7.workingHypothesis}</h2></section><section className="trainer-panel"><span className="trainer-kicker">УВЕРЕННОСТЬ · {state.recap.day7.confidenceLevel === "limited" ? "ОГРАНИЧЕННАЯ" : "НИЗКАЯ"}</span><h2>Насколько можно опираться на вывод</h2><p>{state.recap.day7.confidence}</p></section><section className="trainer-panel"><span className="trainer-kicker">СЛЕДУЮЩИЙ ЭКСПЕРИМЕНТ</span><h2>{state.recap.day7.nextExperiment.title}</h2><p>{state.recap.day7.nextExperiment.prompt}</p></section></>}{[["Какие действия были предложены", state.recap.skills], ["По твоим оценкам было полезно", state.recap.helpful], ["Не подошло или получило низкую оценку", state.recap.difficult], ["Польза отмечена повторно", state.recap.repeated], ["Чего мы пока не знаем", state.recap.unknown]].map(([label, values]) => <section className="trainer-panel" key={label as string}><h2>{label}</h2><p>{(values as string[]).join(" · ") || "Нет таких сохранённых данных"}</p></section>)}{state.day < 7 && <p className="trainer-lead">{state.recap.next}</p>}<form className="trainer-panel" onSubmit={async e => { e.preventDefault(); if (await command({ action: "feedback", ...feedback })) setFeedbackSaved(true); }}><h2>Как тебе эта работа?</h2><Score label="Насколько полезно?" value={feedback.helpfulness} onChange={v => setFeedback({ ...feedback, helpfulness: v })}/><Score label="Было ощущение, что тренер понимает и помнит?" value={feedback.understood} onChange={v => setFeedback({ ...feedback, understood: v })}/><Score label="Насколько хочется продолжить?" value={feedback.continueIntent} onChange={v => setFeedback({ ...feedback, continueIntent: v })}/><label className="trainer-label">Что помогло?<textarea className="trainer-input" maxLength={800} value={feedback.helped} onChange={e => setFeedback({ ...feedback, helped: e.target.value })}/></label><label className="trainer-label">Что мешало?<textarea className="trainer-input" maxLength={800} value={feedback.annoyed} onChange={e => setFeedback({ ...feedback, annoyed: e.target.value })}/></label><button className="trainer-primary" disabled={busy || feedbackSaved}>{feedbackSaved ? "Спасибо, ответ сохранён" : "Сохранить отзыв"}</button></form></>}
      </main></>}
    <footer className="trainer-footer"><span>SKILLER</span><p>Не нужно идеально. Достаточно попробовать.</p><small>AI-тренер навыков · не замена психотерапии</small></footer>
  </div>;
}
function Score({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) { return <label className="trainer-score"><span>{label} <strong>{value}/10</strong></span><input type="range" min={0} max={10} value={value} onChange={e => onChange(Number(e.target.value))}/></label>; }
function PlanCard({ plan, busy, command }: { plan: TrainerPlan; busy: boolean; command: (p: Record<string, unknown>) => Promise<TrainerState | null> }) {
  const skill = JSON.parse(plan.skill_json) as SkillView;
  const [helpfulness, setHelpfulness] = useState(5);
  const [after, setAfter] = useState(plan.intensity_before);
  const [remaining, setRemaining] = useState(skill.durationSeconds);
  useEffect(() => { if (!plan.attempt_id) return; const timer = setInterval(() => setRemaining(v => Math.max(0, v - 1)), 1000); return () => clearInterval(timer); }, [plan.attempt_id]);
  return (
    <section className="trainer-plan">
      <span className="trainer-kicker">ОДНО ПОСИЛЬНОЕ ДЕЙСТВИЕ · {Math.ceil(skill.durationSeconds / 60)} МИН</span>
      <h2>{skill.title}</h2>
      <p>{skill.description}</p>
      <p className="trainer-decision-reason"><strong>Почему такой шаг</strong><span>{explainDecisionReason(plan.decision_reason_code)}</span></p>
      <ol>{skill.steps.map((step) => <li key={step.title}><strong>{step.title}</strong><p>{step.copy}</p></li>)}</ol>
      {!plan.attempt_id ? (
        <button className="trainer-primary" disabled={busy} onClick={() => command({ action: "start", planId: plan.id })}>Начать действие <Play size={16}/></button>
      ) : (
        <>
          <div className="trainer-timer">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}<small>Ориентир, не экзамен. Закончить можно раньше.</small></div>
          <Score label="Насколько это было полезно?" value={helpfulness} onChange={setHelpfulness}/>
          {plan.entry_mode === "distress" && <Score label="Интенсивность после практики" value={after} onChange={setAfter}/>} 
          <div className="trainer-actions">
            {[["done", "Получилось"], ["partial", "Частично"], ["failed", "Не получилось"], ["more", "Сделал больше / продолжил"]].map(([result, label]) => (
              <button disabled={busy} className="trainer-secondary" key={result} onClick={() => command({ action: "outcome", planId: plan.id, result, helpfulness, intensity: after })}>{label}</button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
