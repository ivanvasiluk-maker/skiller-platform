"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BrainCircuit, CalendarClock, Check, ClipboardList, Dumbbell, Home, Mic, Play, ShieldAlert, Sparkles, Square, Target, Trash2, UserRound, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { DashboardData, RecommendationResult, SkillView } from "@/lib/skiller-data";
import type { OnboardingGoalDraft, SituationChain } from "@/lib/situation-analysis";

type Recommendation = RecommendationResult;
type SkillSession = { skill: SkillView; mode: "help" | "practice"; situationId?: string; attemptId?: string };
type Outcome = { completed: boolean; reliefDelta: number; goalProgress: number; helpfulness: number; avoidance: boolean; note: string };
type OnboardingDraft = { focus: string; goal: string; practiceStyle: string; supportMode: string; safetyAcknowledged: boolean };
type RecorderState = "idle" | "recording" | "ready" | "transcribing";

const tabs = [
  ["today", "Сегодня", Home],
  ["help", "Сейчас", Zap],
  ["practice", "Практика", Dumbbell],
  ["protocol", "Протокол", ClipboardList],
  ["psychologist", "Психолог", UserRound],
] as const;

const emptyChain: SituationChain = {
  context: "неизвестно",
  vulnerability: "неизвестно",
  trigger: "неизвестно",
  thoughts: "неизвестно",
  emotions: "неизвестно",
  body: "неизвестно",
  urges: "неизвестно",
  actions: "неизвестно",
  targetBehavior: "неизвестно",
  immediateConsequences: "неизвестно",
  laterConsequences: "неизвестно",
  skillPoint: "неизвестно",
  userWords: "неизвестно",
  aiHypotheses: "неизвестно",
};

async function post<T = DashboardData>(payload: Record<string, unknown>): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch("/api/skiller", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: controller.signal });
    const data = await response.json() as T & { error?: string; openai?: { status?: number; code?: string } };
    if (!response.ok) {
      const details = data.openai?.status || data.openai?.code ? ` (${[data.openai?.status, data.openai?.code].filter(Boolean).join(", ")})` : "";
      throw new Error(`${data.error || "Не удалось сохранить данные"}${details}`);
    }
    return data;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("Сервер не ответил за 30 секунд. Попробуйте ещё раз.");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function postAudio(audio: Blob) {
  const form = new FormData();
  form.set("action", "transcribe");
  form.set("audio", audio, "recording.webm");
  const response = await fetch("/api/skiller", { method: "POST", body: form });
  const data = await response.json() as { text?: string; error?: string; openai?: { status?: number; code?: string } };
  if (!response.ok) {
    const details = data.openai?.status || data.openai?.code ? ` (${[data.openai?.status, data.openai?.code].filter(Boolean).join(", ")})` : "";
    throw new Error(`${data.error || "Не удалось расшифровать запись"}${details}`);
  }
  return { text: data.text ?? "" };
}

function firstName(value: string) {
  const name = value.includes("@") ? "Профиль" : value.trim().split(/\s+/)[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function SkillerApp({ initialData }: { initialData: DashboardData }) {
  const [data, setData] = useState(initialData);
  const [tab, setTab] = useState("today");
  const [kind, setKind] = useState("stuck");
  const [description, setDescription] = useState("");
  const [firstSignal, setFirstSignal] = useState("thought");
  const [actionUrge, setActionUrge] = useState("avoid");
  const [desiredDirection, setDesiredDirection] = useState("goal");
  const [importantGoal, setImportantGoal] = useState("");
  const [intensity, setIntensity] = useState(6);
  const [risk, setRisk] = useState("no");
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [chainDraft, setChainDraft] = useState<SituationChain>(emptyChain);
  const [chainConfirmed, setChainConfirmed] = useState(false);
  const [session, setSession] = useState<SkillSession | null>(null);
  const [phase, setPhase] = useState<"steps" | "result">("steps");
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [outcome, setOutcome] = useState<Outcome>({ completed: true, reliefDelta: 0, goalProgress: 5, helpfulness: 5, avoidance: false, note: "" });
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [onboarding, setOnboarding] = useState<OnboardingDraft>({ focus: "", goal: "", practiceStyle: "short", supportMode: "solo", safetyAcknowledged: false });
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [delayedOutcome, setDelayedOutcome] = useState({ goalProgress: 5, helpfulness: 5, avoidance: false, note: "" });
  const [recorder, setRecorder] = useState<RecorderState>("idle");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [recorderError, setRecorderError] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const skills = useMemo(() => Object.fromEntries(data.skills.map((skill) => [skill.id, skill])), [data.skills]);
  const activeSkill = data.protocol[0]?.skillId ? skills[data.protocol[0].skillId] : skills[data.suggestedSkillId] ?? skills["micro-start"] ?? data.skills[0];

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
  }

  useEffect(() => {
    if (!session || phase !== "steps" || remaining <= 0) return;
    const timer = window.setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [session, phase, remaining]);

  useEffect(() => {
    if (recorder !== "recording") return;
    const timer = window.setInterval(() => setRecordingSeconds((value) => {
      if (value >= 119) stopRecording();
      return Math.min(120, value + 1);
    }), 1000);
    return () => window.clearInterval(timer);
  }, [recorder]);

  useEffect(() => () => {
    stopStream();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  const flash = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(""), 3600); };

  async function startRecording() {
    setRecorderError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setRecorderError("Браузер не поддерживает запись аудио. Можно ввести текст вручную.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      streamRef.current = stream;
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
        setAudioBlob(blob);
        setAudioUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return URL.createObjectURL(blob);
        });
        setRecorder(blob.size ? "ready" : "idle");
        stopStream();
      };
      setRecordingSeconds(0);
      mediaRecorder.start();
      setRecorder("recording");
    } catch {
      setRecorderError("Доступ к микрофону не получен. Можно продолжить текстом.");
      stopStream();
    }
  }

  function stopRecording() {
    const current = mediaRecorderRef.current;
    if (current && current.state !== "inactive") current.stop();
  }

  function clearRecording() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl("");
    setRecordingSeconds(0);
    setRecorder("idle");
  }

  async function transcribeRecording() {
    if (!audioBlob) return;
    setRecorder("transcribing");
    try {
      const result = await postAudio(audioBlob);
      setDescription(result.text);
      setRecommendation(null);
      setChainConfirmed(false);
      flash("Текст расшифрован. Проверьте и исправьте его перед разбором.");
      setRecorder("ready");
    } catch (error) {
      setRecorder("ready");
      flash(error instanceof Error ? error.message : "Не удалось расшифровать запись");
    }
  }

  async function askForRecommendation(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setRecommendation(null);
    setChainConfirmed(false);
    try {
      const result = await post({ action: "recommend", kind, description, firstSignal, actionUrge, desiredDirection, importantGoal, intensity, risk }) as Recommendation;
      setRecommendation(result);
      setChainDraft(result.analysis?.chain ?? emptyChain);
    } catch (error) {
      flash(error instanceof Error ? error.message : "Не удалось подобрать шаг");
    } finally {
      setBusy(false);
    }
  }

  async function confirmChain() {
    if (!recommendation?.situationId) return;
    setBusy(true);
    try {
      await post({ action: "confirmChain", situationId: recommendation.situationId, confirmedText: description, chain: chainDraft });
      setChainConfirmed(true);
      flash("Цепочка подтверждена");
    } catch (error) {
      flash(error instanceof Error ? error.message : "Не удалось сохранить цепочку");
    } finally {
      setBusy(false);
    }
  }

  async function openSkill(skill: SkillView, mode: "help" | "practice", situationId?: string) {
    if (mode === "help" && recommendation?.analysis && !chainConfirmed) {
      flash("Сначала подтвердите или исправьте цепочку");
      return;
    }
    setBusy(true);
    try {
      const result = await post<{ attemptId: string }>({ action: "start", skillId: skill.id, situationId, mode });
      setSession({ skill, mode, situationId, attemptId: result.attemptId });
      setRemaining(skill.durationSeconds);
      setPhase("steps");
      setOutcome({ completed: true, reliefDelta: 0, goalProgress: 5, helpfulness: 5, avoidance: false, note: "" });
    } catch (error) {
      flash(error instanceof Error ? error.message : "Не удалось начать практику");
    } finally {
      setBusy(false);
    }
  }

  async function saveOutcome() {
    if (!session?.attemptId) return;
    setBusy(true);
    try {
      setData(await post({ action: "complete", attemptId: session.attemptId, ...outcome }));
      setSession(null);
      setTab("today");
      flash("Результат сохранён. Позже проверим, сохранился ли эффект");
    } catch (error) {
      flash(error instanceof Error ? error.message : "Не удалось сохранить результат");
    } finally {
      setBusy(false);
    }
  }

  async function saveOnboarding() {
    setBusy(true);
    try {
      setData(await post({ action: "onboarding", ...onboarding }));
      setTab("today");
      flash("Первый маршрут готов");
    } catch (error) {
      flash(error instanceof Error ? error.message : "Не удалось сохранить ответы");
    } finally {
      setBusy(false);
    }
  }

  async function saveDelayedOutcome() {
    if (!data.pendingCheckIn) return;
    setBusy(true);
    try {
      setData(await post({ action: "delayedComplete", attemptId: data.pendingCheckIn.attemptId, ...delayedOutcome }));
      setCheckInOpen(false);
      setDelayedOutcome({ goalProgress: 5, helpfulness: 5, avoidance: false, note: "" });
      flash("Отложенный результат учтён в личной карте");
    } catch (error) {
      flash(error instanceof Error ? error.message : "Не удалось сохранить проверку");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSituation(situationId: string) {
    setBusy(true);
    try {
      setData(await post({ action: "deleteSituation", situationId }));
      flash("Ситуация и связанные записи удалены");
    } catch (error) {
      flash(error instanceof Error ? error.message : "Не удалось удалить ситуацию");
    } finally {
      setBusy(false);
    }
  }

  async function saveAccess(next: DashboardData["access"]) {
    const previous = data.access;
    setData((current) => ({ ...current, access: next }));
    try {
      await post({ action: "access", ...next });
    } catch (error) {
      setData((current) => ({ ...current, access: previous }));
      flash(error instanceof Error ? error.message : "Не удалось изменить доступ");
    }
  }

  const minutes = Math.floor(remaining / 60).toString().padStart(2, "0");
  const seconds = (remaining % 60).toString().padStart(2, "0");

  return (
    <Tabs value={tab} onValueChange={setTab} className="min-h-screen bg-[#f4f7fb] text-[#132348]">
      <header className="sticky top-0 z-30 border-b border-[#dce4f0] bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-[1180px] items-center justify-between px-4 md:px-7">
          <button onClick={() => setTab("today")} className="flex items-center gap-3 font-black tracking-[.12em]" aria-label="На главный экран"><span className="grid size-10 place-items-center rounded-2xl bg-[#132348] text-white">S</span> SKILLER</button>
          <div className="flex items-center gap-3 text-right"><span className="hidden sm:block"><strong className="block text-sm">{firstName(data.user.displayName)}</strong><small className="text-[#718099]">данные сохранены</small></span><span className="grid size-10 place-items-center rounded-full bg-[#dff7f1] font-black text-[#087866]">{firstName(data.user.displayName).slice(0, 1)}</span></div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1180px] gap-7 px-4 pb-28 pt-6 md:grid-cols-[210px_minmax(0,1fr)] md:px-7 md:pb-10 md:pt-8">
        <TabsList className="fixed inset-x-2 bottom-2 z-40 grid h-auto w-auto grid-cols-5 rounded-2xl border border-[#dce4f0] bg-white/95 p-1.5 shadow-[0_16px_45px_rgba(19,35,72,.18)] backdrop-blur-xl md:sticky md:top-[104px] md:inset-auto md:flex md:h-fit md:w-full md:flex-col md:rounded-[22px] md:p-2 md:shadow-none">
          {tabs.map(([value, label, Icon]) => <TabsTrigger key={value} value={value} className="h-14 flex-col gap-1 rounded-xl px-1 text-[11px] data-[state=active]:bg-[#eaf0ff] data-[state=active]:text-[#2868f5] md:h-12 md:w-full md:flex-row md:justify-start md:gap-3 md:px-3 md:text-sm"><Icon className="size-[18px]" /> {label}</TabsTrigger>)}
        </TabsList>

        <main className="min-w-0">
          <TabsContent value="today"><Today data={data} activeSkill={activeSkill} onGo={setTab} onStart={openSkill} onCheckIn={() => setCheckInOpen(true)} /></TabsContent>
          <TabsContent value="help">
            <ScreenHeading eyebrow="Помощь сейчас" title="Что происходит в этот момент?" copy="Расскажите голосом или текстом. Перед навыком вы подтвердите текст и цепочку." />
            <form onSubmit={askForRecommendation} className="surface mt-5 grid gap-6 p-5 md:p-7">
              <RecorderPanel state={recorder} seconds={recordingSeconds} audioUrl={audioUrl} error={recorderError} onStart={startRecording} onStop={stopRecording} onClear={clearRecording} onTranscribe={transcribeRecording} />
              <div><label className="field-title">На что это больше похоже?</label><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[["stuck","Я застрял"],["emotion","Сильная эмоция"],["conflict","Конфликт"],["other","Другое"]].map(([value,label]) => <button key={value} type="button" onClick={() => setKind(value)} className={`choice ${kind === value ? "choice-active" : ""}`}>{label}</button>)}</div></div>
              <div><label className="field-title" htmlFor="situation">Подтверждённый текст ситуации</label><Textarea id="situation" value={description} onChange={(e) => { setDescription(e.target.value); setRecommendation(null); setChainConfirmed(false); }} className="min-h-32 rounded-xl bg-[#f8faff] text-base" placeholder="Например: уже час смотрю на задачу и открываю новости вместо первого шага" /><p className="mt-2 text-sm leading-6 text-[#718099]">Проверьте текст перед анализом. Аудио не сохраняется постоянно.</p></div>
              <div><div className="mb-3 flex items-center justify-between"><label className="field-title mb-0">Насколько сильно накрывает?</label><strong className="text-[#2868f5]">{intensity} из 10</strong></div><Slider min={1} max={10} step={1} value={[intensity]} onValueChange={(value) => setIntensity(value[0])} /><div className="mt-2 flex justify-between text-xs text-[#718099]"><span>Можно думать</span><span>Очень сильно</span></div></div>
              <div className="rounded-2xl border border-[#dce4f0] bg-[#f8faff] p-4"><label className="field-title">Есть ли риск причинить вред себе или кому-то либо потерять контроль?</label><p className="mb-4 text-sm leading-6 text-[#718099]">Этот ответ проверяется до AI-разбора и подбора навыка.</p><RadioGroup value={risk} onValueChange={setRisk} className="grid grid-cols-2 gap-2">{[["no","Нет"],["yes","Да / не уверен"]].map(([value,label]) => <label key={value} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 font-bold ${risk===value?"border-[#2868f5] bg-white text-[#2868f5]":"border-[#dce4f0]"}`}><RadioGroupItem value={value}/>{label}</label>)}</RadioGroup></div>
              {risk === "no" && <><ChainChoices title="Что появилось первым?" value={firstSignal} onChange={setFirstSignal} options={[["thought","Мысль"],["body","Ощущение в теле"],["emotion","Эмоция"],["urge","Импульс"]]} />{intensity < 8 && <><ChainChoices title="Что хочется сделать автоматически?" value={actionUrge} onChange={setActionUrge} options={[["avoid","Отложить / замереть"],["distract","Переключиться"],["attack","Напасть / доказать"],["withdraw","Уйти / закрыться"]]} /><ChainChoices title="Какое направление сейчас важнее?" value={desiredDirection} onChange={setDesiredDirection} options={[["goal","Сделать шаг к цели"],["relationship","Сохранить контакт"],["stabilize","Сначала стабилизироваться"]]} /><div><label className="field-title" htmlFor="important-goal">К чему важно прийти?</label><Textarea id="important-goal" value={importantGoal} onChange={(e) => setImportantGoal(e.target.value)} className="min-h-20 rounded-xl bg-[#f8faff] text-base" placeholder="Например: открыть документ и начать; договориться без ссоры" /></div></>}</>}
              <Button disabled={busy || description.trim().length < 5} className="h-13 rounded-xl bg-[#2868f5] text-base font-bold">{busy ? "Разбираем..." : "Сформировать цепочку и навык"}</Button>
            </form>
            {recommendation?.safetyStatus === "escalate" && <SafetyCard />}
            {recommendation?.analysis && <SituationAnalysisCard analysis={recommendation.analysis} chain={chainDraft} confirmed={chainConfirmed} busy={busy} onChange={setChainDraft} onConfirm={confirmChain} />}
            {recommendation?.skill && <RecommendationCard recommendation={recommendation} chainConfirmed={!recommendation.analysis || chainConfirmed} busy={busy} onStart={openSkill} />}
          </TabsContent>
          <TabsContent value="practice"><Practice skills={data.skills} onStart={openSkill} /></TabsContent>
          <TabsContent value="protocol"><Protocol data={data} onDeleteSituation={deleteSituation} busy={busy} /></TabsContent>
          <TabsContent value="psychologist"><Psychologist data={data} onChange={saveAccess} /></TabsContent>
        </main>
      </div>

      <OnboardingDialog open={!data.onboarding} step={onboardingStep} draft={onboarding} busy={busy} onStep={setOnboardingStep} onChange={(patch) => setOnboarding((current) => ({ ...current, ...patch }))} onSave={saveOnboarding} />

      <Dialog open={checkInOpen && Boolean(data.pendingCheckIn)} onOpenChange={setCheckInOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-[26px] border-[#dce4f0] p-5 sm:max-w-xl sm:p-7">
          <DialogHeader><p className="eyebrow">Проверка спустя время</p><DialogTitle className="text-2xl font-black text-[#132348]">Что осталось после навыка?</DialogTitle><DialogDescription className="text-base leading-6">Сразу могло стать легче. Сейчас важнее понять, помогло ли действие приблизиться к цели.</DialogDescription></DialogHeader>
          {data.pendingCheckIn && <div className="rounded-2xl bg-[#f0f5ff] p-4"><strong>{data.pendingCheckIn.skillTitle}</strong><p className="mt-1 text-sm text-[#637087]">Сразу после практики: движение к цели {data.pendingCheckIn.immediateGoalProgress}/10</p></div>}
          <div className="grid gap-5 pt-2"><Rating label="Насколько результат сохранился?" value={delayedOutcome.helpfulness} min={0} max={10} left="Не сохранился" right="Сохранился" onChange={(value)=>setDelayedOutcome((current)=>({...current,helpfulness:value}))}/><Rating label="Насколько это приблизило к цели?" value={delayedOutcome.goalProgress} min={0} max={10} left="Не приблизило" right="Приблизило" onChange={(value)=>setDelayedOutcome((current)=>({...current,goalProgress:value}))}/><label className="flex items-start gap-3 rounded-2xl border border-[#dce4f0] bg-[#f8faff] p-4"><Checkbox checked={delayedOutcome.avoidance} onCheckedChange={(checked)=>setDelayedOutcome((current)=>({...current,avoidance:Boolean(checked)}))}/><span><strong className="block">Навык помог отложить важное действие</strong><small className="mt-1 block leading-5 text-[#718099]">Это снизит уверенность системы, даже если сразу стало легче.</small></span></label><Textarea value={delayedOutcome.note} onChange={(event)=>setDelayedOutcome((current)=>({...current,note:event.target.value}))} placeholder="Что произошло после практики? Необязательно" className="min-h-20 rounded-xl"/><Button disabled={busy} onClick={saveDelayedOutcome} className="h-13 rounded-xl bg-[#2868f5] text-base font-bold">{busy ? "Сохраняем..." : "Обновить личную карту"}</Button></div>
        </DialogContent>
      </Dialog>

      <Sheet open={Boolean(session)} onOpenChange={(open) => !open && setSession(null)}>
        <SheetContent side="bottom" className="mx-auto max-h-[94vh] max-w-2xl overflow-y-auto rounded-t-[28px] border-[#dce4f0] px-5 pb-7 md:left-1/2 md:bottom-5 md:max-w-[680px] md:-translate-x-1/2 md:rounded-[28px] md:border">
          {session && <><SheetHeader className="px-0 pt-7"><p className="eyebrow">{phase === "steps" ? session.skill.approach : "Результат эксперимента"}</p><SheetTitle className="text-2xl font-black text-[#132348]">{phase === "steps" ? session.skill.title : "Что изменилось после навыка?"}</SheetTitle><SheetDescription className="text-base leading-6">{phase === "steps" ? session.skill.description : "Сохраним выполнение, движение к цели, состояние и помехи."}</SheetDescription></SheetHeader>{phase === "steps" ? <div><ol className="my-4 grid gap-2">{session.skill.steps.map((step, index) => <li key={step.title} className="grid grid-cols-[36px_1fr] gap-3 rounded-2xl bg-[#f4f7fb] p-3"><span className="grid size-9 place-items-center rounded-full bg-[#2868f5] font-black text-white">{index+1}</span><div><strong>{step.title}</strong><p className="mt-1 text-sm leading-6 text-[#718099]">{step.copy}</p></div></li>)}</ol><div className="my-5 text-center text-4xl font-black tabular-nums tracking-tight">{minutes}:{seconds}</div><Button onClick={() => setPhase("result")} className="h-13 w-full rounded-xl bg-[#132348] text-base font-bold">Перейти к результату <Check /></Button></div> : <OutcomeForm outcome={outcome} setOutcome={setOutcome} onSave={saveOutcome} busy={busy} />}</>}
        </SheetContent>
      </Sheet>
      {notice && <div role="status" className="fixed bottom-24 left-1/2 z-[70] w-[calc(100%-32px)] max-w-md -translate-x-1/2 rounded-xl bg-[#132348] px-4 py-3 text-center text-sm font-bold text-white shadow-2xl md:bottom-6">{notice}</div>}
    </Tabs>
  );
}

function RecorderPanel({ state, seconds, audioUrl, error, onStart, onStop, onClear, onTranscribe }: { state: RecorderState; seconds: number; audioUrl: string; error: string; onStart: () => void; onStop: () => void; onClear: () => void; onTranscribe: () => void }) {
  const time = `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  return <section className="rounded-2xl border border-[#dce4f0] bg-[#f8faff] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><strong className="block">Голосовой рассказ</strong><p className="mt-1 text-sm leading-6 text-[#718099]">Перед расшифровкой аудио будет отправлено OpenAI. Лимит: 2 минуты и 8 МБ.</p></div><span className="rounded-xl bg-white px-3 py-2 font-black tabular-nums text-[#2868f5]">{state === "recording" ? time : state === "transcribing" ? "..." : "00:00"}</span></div><div className="mt-4 flex flex-wrap gap-2">{state !== "recording" && <Button type="button" variant="outline" onClick={onStart} className="h-11 rounded-xl"><Mic/> Записать</Button>}{state === "recording" && <Button type="button" onClick={onStop} className="h-11 rounded-xl bg-[#c82c43]"><Square/> Остановить</Button>}{audioUrl && <><a href={audioUrl} className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#dce4f0] bg-white px-4 font-bold text-[#132348]"><Play className="size-4"/> Прослушать</a><Button type="button" variant="outline" onClick={onClear} className="h-11 rounded-xl"><Trash2/> Удалить</Button><Button type="button" disabled={state === "transcribing"} onClick={onTranscribe} className="h-11 rounded-xl bg-[#132348] font-bold">Отправить на расшифровку</Button></>}</div>{error && <p className="mt-3 text-sm leading-6 text-[#b42036]">{error}</p>}</section>;
}

function OnboardingDialog({ open, step, draft, busy, onStep, onChange, onSave }: { open: boolean; step: number; draft: OnboardingDraft; busy: boolean; onStep: (step:number)=>void; onChange:(patch:Partial<OnboardingDraft>)=>void; onSave:()=>void }) {
  const [story, setStory] = useState("");
  const [draftGoal, setDraftGoal] = useState<OnboardingGoalDraft | null>(null);
  const [draftBusy, setDraftBusy] = useState(false);
  const titles = ["Расскажите своими словами", "Подтвердите первый фокус", "Как удобнее практиковаться?", "Кто будет рядом?"];
  const descriptions = ["Можно начать с общего рассказа, а не с анкеты.", "Черновик можно исправить. Это не диагноз.", "SKILLER будет учитывать нагрузку, но не станет прятать важные шаги за комфортом.", "Самостоятельная практика и работа с психологом могут дополнять друг друга."];
  const canContinue = step === 0 ? story.trim().length >= 5 || Boolean(draft.focus) : step === 1 ? Boolean(draft.focus) && draft.goal.trim().length >= 5 : step === 3 ? draft.safetyAcknowledged : true;
  async function makeDraft() { setDraftBusy(true); try { const result = await post<{ draft: OnboardingGoalDraft | null }>({ action: "onboardingDraft", story }); if (result.draft) { setDraftGoal(result.draft); onChange({ focus: result.draft.focus, goal: result.draft.goal }); } else if (!draft.focus) { onChange({ focus: "start" }); } } finally { setDraftBusy(false); } }
  return <Dialog open={open} onOpenChange={()=>{}}><DialogContent showCloseButton={false} onEscapeKeyDown={(event)=>event.preventDefault()} onPointerDownOutside={(event)=>event.preventDefault()} className="max-h-[94vh] overflow-y-auto rounded-[28px] border-[#dce4f0] p-0 sm:max-w-[640px]"><div className="bg-[#132348] px-5 py-5 text-white sm:px-7"><div className="flex items-center justify-between"><span className="font-black tracking-[.12em]">SKILLER</span><span className="text-sm text-white/65">{step+1} из 4</span></div><div className="mt-4 grid grid-cols-4 gap-2" aria-label={`Шаг ${step+1} из 4`}>{[0,1,2,3].map((item)=><span key={item} className={`h-1.5 rounded-full ${item<=step?"bg-[#62ddc3]":"bg-white/15"}`}/>)}</div></div><div className="p-5 sm:p-7"><DialogHeader><p className="eyebrow">Личный маршрут</p><DialogTitle className="mt-1 text-2xl font-black tracking-tight text-[#132348] sm:text-3xl">{titles[step]}</DialogTitle><DialogDescription className="text-base leading-7 text-[#718099]">{descriptions[step]}</DialogDescription></DialogHeader><div className="mt-6">{step===0&&<div className="grid gap-4"><Textarea value={story} onChange={(event)=>setStory(event.target.value)} className="min-h-36 rounded-xl bg-[#f8faff] text-base" placeholder="Например: я часто откладываю важные разговоры, потом злюсь на себя и избегаю людей"/><div className="flex flex-wrap gap-2"><Button type="button" disabled={draftBusy || story.trim().length < 12} onClick={makeDraft} className="h-11 rounded-xl bg-[#2868f5] font-bold">{draftBusy ? "Готовим..." : "Предложить цель"}</Button><Button type="button" variant="ghost" onClick={()=>onStep(1)} className="h-11 rounded-xl">Пропустить</Button></div>{draftGoal && <p className="rounded-2xl bg-[#effbf8] p-4 text-sm leading-6 text-[#087866]">{draftGoal.recentEpisodePrompt}</p>}</div>}{step===1&&<div className="grid gap-5"><div><label className="field-title">Фокус</label><div className="grid gap-2 sm:grid-cols-2">{[["start","Начинать важные дела"],["emotions","Выдерживать эмоции"],["relationships","Отношения и границы"],["impulses","Не действовать на автомате"],["loneliness","Создавать связи"]].map(([value,label])=><button key={value} onClick={()=>onChange({focus:value})} className={`choice text-left ${draft.focus===value?"choice-active":""}`}>{label}</button>)}</div></div><div><label className="field-title" htmlFor="onboarding-goal">Наблюдаемая цель</label><Textarea id="onboarding-goal" value={draft.goal} onChange={(event)=>onChange({goal:event.target.value})} className="min-h-28 rounded-xl bg-[#f8faff] text-base" placeholder="Например: открыть документ и написать первый абзац до обеда"/></div></div>}{step===2&&<div className="grid gap-2">{[["short","Коротко и часто","2-3 минуты, один конкретный шаг"],["guided","Подробно и с объяснением","Больше контекста перед практикой"],["mixed","По ситуации","Коротко в моменте, подробнее в тренировке"]].map(([value,title,copy])=><button key={value} onClick={()=>onChange({practiceStyle:value})} className={`choice min-h-20 text-left ${draft.practiceStyle===value?"choice-active":""}`}><strong className="block">{title}</strong><small className="mt-1 block font-normal leading-5 text-[#718099]">{copy}</small></button>)}</div>}{step===3&&<div className="grid gap-4"><div className="grid gap-2">{[["solo","Пока самостоятельно","Психолога можно подключить позже"],["own_psychologist","Есть свой психолог","Доступ появится только после вашего согласия"],["specialist_later","Хочу разбор со специалистом","Когда накопится личная карта"]].map(([value,title,copy])=><button key={value} onClick={()=>onChange({supportMode:value})} className={`choice min-h-20 text-left ${draft.supportMode===value?"choice-active":""}`}><strong className="block">{title}</strong><small className="mt-1 block font-normal leading-5 text-[#718099]">{copy}</small></button>)}</div><label className="flex items-start gap-3 rounded-2xl border border-[#efc6cd] bg-[#fff6f7] p-4"><Checkbox checked={draft.safetyAcknowledged} onCheckedChange={(checked)=>onChange({safetyAcknowledged:Boolean(checked)})}/><span><strong className="block">Я понимаю границы самостоятельной практики</strong><small className="mt-1 block leading-5 text-[#71535a]">При риске причинить вред себе или другому SKILLER остановит подбор и предложит обратиться за живой помощью.</small></span></label></div>}</div><div className="mt-7 flex items-center justify-between gap-3">{step>0?<Button variant="ghost" onClick={()=>onStep(step-1)} className="h-12 rounded-xl"><ArrowLeft/> Назад</Button>:<span/>}<Button disabled={!canContinue||busy} onClick={()=>step<3?onStep(step+1):onSave()} className="h-12 rounded-xl bg-[#2868f5] px-5 font-bold">{step<3?<>Продолжить <ArrowRight/></>:busy?"Сохраняем...":"Собрать первый маршрут"}</Button></div><p className="mt-5 text-center text-xs leading-5 text-[#8793a7]">Ответы используются только для подбора и проверки навыков. Это не медицинская диагностика.</p></div></DialogContent></Dialog>;
}

function ScreenHeading({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) { return <div><p className="eyebrow">{eyebrow}</p><h1 className="mt-2 text-3xl font-black tracking-[-.035em] md:text-4xl">{title}</h1><p className="mt-3 max-w-2xl text-base leading-7 text-[#718099]">{copy}</p></div>; }
function ChainChoices({ title, value, onChange, options }: { title: string; value: string; onChange: (value: string) => void; options: string[][] }) { return <div><label className="field-title">{title}</label><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{options.map(([option,label])=><button key={option} type="button" onClick={()=>onChange(option)} className={`choice ${value===option?"choice-active":""}`}>{label}</button>)}</div></div>; }
function Today({ data, activeSkill, onGo, onStart, onCheckIn }: { data: DashboardData; activeSkill?: SkillView; onGo: (tab:string)=>void; onStart: (skill:SkillView,mode:"practice")=>void; onCheckIn:()=>void }) { const focusLabels:Record<string,string>={start:"Начинать важные дела",emotions:"Выдерживать сильные эмоции",relationships:"Отношения и границы",impulses:"Не действовать на автомате",loneliness:"Создавать и сохранять связи"}; return <><ScreenHeading eyebrow="Сегодня" title="Один следующий эксперимент" copy={data.onboarding?.goal ? `Ваш ориентир: ${data.onboarding.goal}` : "Продолжите один эксперимент или разберите то, что происходит прямо сейчас."} />{data.onboarding&&<div className="mt-4 flex items-center gap-3 rounded-2xl border border-[#cfe8e2] bg-[#effbf8] p-4"><Target className="size-5 shrink-0 text-[#087866]"/><p className="text-sm"><strong>{focusLabels[data.onboarding.focus]??"Личный фокус"}</strong><span className="ml-2 text-[#64758b]">маршрут будет меняться по результатам практики</span></p></div>}{data.pendingCheckIn&&<button onClick={onCheckIn} className="mt-4 grid w-full grid-cols-[44px_1fr_auto] items-center gap-3 rounded-2xl border border-[#b8d8d0] bg-white p-4 text-left shadow-[0_10px_30px_rgba(19,35,72,.05)]"><span className="grid size-11 place-items-center rounded-xl bg-[#dff7f1] text-[#087866]"><CalendarClock/></span><span><strong className="block">Проверить, что осталось после навыка</strong><small className="mt-1 block text-[#718099]">{data.pendingCheckIn.skillTitle} · около минуты</small></span><ArrowRight className="size-5 text-[#087866]"/></button>}{activeSkill && <section className="hero-card mt-6 overflow-hidden rounded-[28px] p-6 text-white md:p-8"><div className="relative z-10"><div className="flex flex-wrap items-center justify-between gap-2"><span className="pill bg-white/12 text-white">{data.protocol.length?"Следующая проверка":"Первый эксперимент"}</span><span className="text-sm text-white/65">личная уверенность {data.protocol[0]?.confidence ?? 0}%</span></div><p className="mt-8 text-sm text-[#9eb9f4]">{activeSkill.track}</p><h2 className="mt-2 max-w-xl text-2xl font-black tracking-tight md:text-3xl">{activeSkill.title}</h2><p className="mt-3 max-w-xl leading-7 text-white/70">{activeSkill.description}</p><div className="mt-7 flex flex-wrap items-center justify-between gap-4"><span className="text-sm text-white/60">{data.stats.completions} завершённых проверок</span><Button onClick={() => onStart(activeSkill,"practice")} className="h-12 rounded-xl bg-white px-5 font-bold text-[#173674] hover:bg-white/90">Начать · {Math.ceil(activeSkill.durationSeconds/60)} мин</Button></div></div></section>}<div className="mt-4 grid gap-3 sm:grid-cols-2"><button onClick={()=>onGo("help")} className="quick-card border-[#cbdafd] bg-gradient-to-br from-white to-[#eef3ff]"><span className="quick-icon bg-[#e5ecff] text-[#2868f5]"><Zap/></span><span><strong>Помощь сейчас</strong><small>Разобрать текущую ситуацию</small></span><ArrowRight/></button><button onClick={()=>onGo("practice")} className="quick-card"><span className="quick-icon bg-[#dff7f1] text-[#087866]"><Dumbbell/></span><span><strong>Потренироваться</strong><small>Заранее, без сильного стресса</small></span><ArrowRight/></button></div><h2 className="mb-3 mt-8 text-xl font-black">Система становится точнее</h2><div className="grid gap-3 sm:grid-cols-3"><Metric value={data.stats.attempts} label="экспериментов" copy="в личной истории"/><Metric value={data.protocol.length} label="навыков в карте" copy="проверены на практике" accent/><Metric value={`${data.stats.completionRate}%`} label="выполнение" copy="из начатых попыток"/></div></>; }
function Metric({value,label,copy,accent=false}:{value:string|number;label:string;copy:string;accent?:boolean}) { return <article className={`surface min-h-36 p-5 ${accent ? "bg-[#eafaf6]" : ""}`}><strong className="text-3xl font-black">{value}</strong><span className="mt-2 block font-bold">{label}</span><small className="mt-5 block text-[#718099]">{copy}</small></article>; }
function SafetyCard() { return <section className="mt-4 flex gap-4 rounded-[24px] border border-[#efc6cd] bg-[#fff1f3] p-5"><span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#c82c43] text-white"><ShieldAlert/></span><div><p className="eyebrow text-[#b42036]">Нужна живая помощь</p><h2 className="mt-2 text-xl font-black">Обычный подбор остановлен</h2><p className="mt-2 leading-7 text-[#714b54]">Перейдите в более безопасное место и свяжитесь с человеком, который может быть рядом. При непосредственной опасности обратитесь в местную экстренную службу.</p></div></section>; }
function SituationAnalysisCard({ analysis, chain, confirmed, busy, onChange, onConfirm }: { analysis: NonNullable<Recommendation["analysis"]>; chain: SituationChain; confirmed: boolean; busy: boolean; onChange: (chain: SituationChain)=>void; onConfirm:()=>void }) { const fields: Array<[keyof SituationChain,string]> = [["context","Контекст"],["vulnerability","Факторы уязвимости"],["trigger","Запускающее событие"],["thoughts","Мысли"],["emotions","Эмоции"],["body","Тело"],["urges","Побуждения"],["actions","Действия"],["targetBehavior","Что хочется изменить"],["immediateConsequences","Ближайшие последствия"],["laterConsequences","Поздние последствия"],["skillPoint","Место навыка"],["userWords","Слова человека"],["aiHypotheses","Гипотезы AI"]]; return <section className="surface mt-4 p-5 md:p-7"><div className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-xl bg-[#e8efff] text-[#2868f5]"><BrainCircuit className="size-5"/></span><div><p className="eyebrow">Расшифровка ситуации</p><h2 className="text-xl font-black">Проверьте цепочку перед навыком</h2></div></div><p className="mt-4 leading-7 text-[#627089]">{analysis.summary}</p><div className="mt-5 grid gap-3 sm:grid-cols-2">{fields.map(([key,label])=><label key={key} className="grid gap-2 rounded-2xl bg-[#f4f7fb] p-4"><strong>{label}</strong><Textarea value={chain[key]} onChange={(event)=>onChange({...chain,[key]:event.target.value})} className="min-h-20 rounded-xl bg-white text-sm" /></label>)}</div><p className="mt-4 rounded-2xl border border-[#d8e3f8] bg-[#f8faff] p-4 text-sm leading-6 text-[#51658e]">{analysis.clarifyingQuestion}</p><Button disabled={busy || confirmed} onClick={onConfirm} className="mt-4 h-12 rounded-xl bg-[#132348] font-bold">{confirmed ? "Цепочка подтверждена" : "Подтвердить цепочку"}</Button></section>; }
function RecommendationCard({ recommendation, chainConfirmed, busy, onStart }: { recommendation: Recommendation; chainConfirmed: boolean; busy:boolean; onStart:(skill:SkillView,mode:"help",situationId?:string)=>void }) { const skill = recommendation.skill!; return <section className="surface mt-4 p-5 md:p-7"><div className="flex items-center justify-between gap-3"><span className="pill bg-[#e8efff] text-[#2868f5]">{chainConfirmed ? "Готово к практике" : "Ждёт подтверждения цепочки"}</span><span className="text-sm text-[#718099]">{Math.ceil(skill.durationSeconds/60)} мин</span></div><p className="eyebrow mt-6">{skill.approach}</p><h2 className="mt-2 text-2xl font-black">{skill.title}</h2><p className="mt-3 leading-7 text-[#627089]">{skill.description}</p><div className="my-5 grid gap-3 rounded-2xl bg-[#f0f5ff] p-4"><div><strong>Звено цепочки</strong><p className="mt-1 text-sm leading-6 text-[#51658e]">{recommendation.changePoint}</p></div><div className="border-t border-[#d8e3f8] pt-3"><strong>Почему этот навык</strong><p className="mt-1 text-sm leading-6 text-[#51658e]">{recommendation.reason ?? skill.why}</p></div><div className="border-t border-[#d8e3f8] pt-3"><strong>Как понять, что получилось</strong><p className="mt-1 text-sm leading-6 text-[#51658e]">После практики отметьте выполнение, движение к цели, изменение состояния и то, что помешало.</p></div></div><Button disabled={busy || !chainConfirmed} onClick={()=>onStart(skill,"help",recommendation.situationId)} className="h-13 w-full rounded-xl bg-[#2868f5] text-base font-bold">Начать навык</Button></section>; }
function Practice({skills,onStart}:{skills:SkillView[];onStart:(skill:SkillView,mode:"practice")=>void}) { return <><ScreenHeading eyebrow="Тренировка" title="Навыки до сложного момента" copy="Короткие репетиции, чтобы нужное действие было доступно под нагрузкой."/><div className="mt-6 grid gap-3">{skills.map((skill,index)=><article key={skill.id} className={`surface grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-center ${index===0?"border-[#bfe8df] bg-gradient-to-br from-white to-[#effcf8]":""}`}><div><div className="flex items-center gap-2"><span className="pill bg-[#edf1f7] text-[#56647d]">{skill.track}</span>{index===0&&<span className="pill bg-[#dff7f1] text-[#087866]">Фокус</span>}</div><h2 className="mt-3 text-xl font-black">{skill.title}</h2><p className="mt-2 leading-6 text-[#718099]">{skill.description}</p></div><Button variant={index===0?"default":"outline"} onClick={()=>onStart(skill,"practice")} className={`h-11 rounded-xl font-bold ${index===0?"bg-[#132348]":""}`}>{Math.ceil(skill.durationSeconds/60)} мин <ArrowRight/></Button></article>)}</div><div className="mt-4 flex gap-3 rounded-2xl border border-dashed border-[#b8c7df] p-4 text-sm leading-6 text-[#637087]"><BrainCircuit className="mt-1 size-5 shrink-0 text-[#2868f5]"/><p><strong className="text-[#132348]">Навык считается освоенным не после просмотра.</strong> Нужны успешные применения в нескольких реальных ситуациях.</p></div></>; }
function Protocol({data,onDeleteSituation,busy}:{data:DashboardData;onDeleteSituation:(id:string)=>void;busy:boolean}) { return <><ScreenHeading eyebrow="Мой протокол" title="Что работает именно для вас" copy="Не диагноз и не тип личности — карта проверенных действий и границ их применимости."/>{data.onboarding&&<section className="surface mt-6 p-5"><p className="eyebrow">Цель</p><h2 className="mt-2 text-xl font-black">{data.onboarding.goal}</h2></section>}{data.protocol.length===0?<section className="surface mt-6 p-8 text-center"><Sparkles className="mx-auto size-10 text-[#2868f5]"/><h2 className="mt-4 text-xl font-black">Карта начнёт формироваться после первой практики</h2><p className="mx-auto mt-2 max-w-md leading-7 text-[#718099]">Система учитывает не только облегчение, но и движение к цели и риск избегания.</p></section>:<div className="mt-6 grid gap-3">{data.protocol.map((item)=><article key={item.skillId} className="surface border-l-4 border-l-[#2868f5] p-5"><div className="flex items-start justify-between gap-3"><div><span className={`text-xs font-black uppercase tracking-[.08em] ${item.status==="working"?"text-[#087866]":"text-[#2868f5]"}`}>{item.status==="working"?"Работает":"Проверяем"}</span><h2 className="mt-1 text-xl font-black">{item.title}</h2><p className="mt-1 text-sm text-[#718099]">{item.track}</p></div><span className="rounded-xl bg-[#eaf0ff] px-3 py-2 font-black text-[#2868f5]">{item.confidence}%</span></div><div className="mt-5 grid grid-cols-3 gap-2 text-center"><Evidence label="Польза" value={item.helpfulness}/><Evidence label="К цели" value={item.goalProgress}/><Evidence label="Облегчение" value={item.relief}/></div><p className="mt-4 text-sm leading-6 text-[#637087]">{item.completions} применений · {item.contextCount} контекстов · {item.delayedFollowups} отложенных проверок</p>{item.delayedFollowups===0&&<p className="mt-2 text-sm leading-6 text-[#8a6424]">Уверенность ограничена, пока неизвестен отложенный результат.</p>}{item.avoidanceCount>0&&<p className="mt-2 text-sm leading-6 text-[#9b3e4d]">Избегание отмечено {item.avoidanceCount} раз — система не считает одно облегчение достаточным.</p>}</article>)}</div>}<h2 className="mb-3 mt-9 text-xl font-black">Текущие ситуации</h2>{data.recentSituations.length===0?<p className="surface p-5 text-[#718099]">После первого разбора здесь появятся подтверждённые цепочки.</p>:<div className="grid gap-3">{data.recentSituations.map((item)=><article key={item.id} className="surface p-5"><div className="flex items-start justify-between gap-3"><div><strong className="text-lg">{item.confirmedText || item.description}</strong><p className="mt-2 text-sm leading-6 text-[#637087]">{item.changePoint} · {item.attempts} попыток</p></div><Button variant="ghost" disabled={busy} onClick={()=>onDeleteSituation(item.id)} className="h-10 rounded-xl text-[#b42036]"><Trash2/> Удалить</Button></div>{item.chain&&<p className="mt-3 rounded-xl bg-[#f4f7fb] p-3 text-sm leading-6 text-[#637087]">Следующий маленький шаг: {item.chain.skillPoint}</p>}</article>)}</div>}<h2 className="mb-3 mt-9 text-xl font-black">История экспериментов</h2>{data.history.length===0?<p className="surface p-5 text-[#718099]">Здесь появятся ситуации, навыки и результаты повторных проверок.</p>:<div className="grid gap-3">{data.history.map((item)=><article key={item.attemptId} className="surface p-5"><div className="flex flex-wrap items-start justify-between gap-2"><div><strong className="text-lg">{item.skillTitle}</strong><p className="mt-1 text-sm text-[#718099]">{item.track} · {item.mode==="help"?"в реальной ситуации":"тренировка"}</p></div><time className="text-sm text-[#718099]">{new Intl.DateTimeFormat("ru",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}).format(new Date(item.completedAt))}</time></div><div className="mt-4 grid gap-2 sm:grid-cols-2"><div className="rounded-xl bg-[#f4f7fb] p-3"><small className="font-bold text-[#718099]">Сразу после</small><p className="mt-1 text-sm">К цели {item.immediate?.goalProgress??"-"}/10 · польза {item.immediate?.helpfulness??"-"}/10</p></div><div className={`rounded-xl p-3 ${item.delayed?"bg-[#eafaf6]":"border border-dashed border-[#cdd6e4]"}`}><small className={`font-bold ${item.delayed?"text-[#087866]":"text-[#718099]"}`}>Позже</small><p className="mt-1 text-sm">{item.delayed?`К цели ${item.delayed.goalProgress}/10 · польза ${item.delayed.helpfulness}/10`:"Ожидает повторной проверки"}</p></div></div>{(item.immediate?.note||item.delayed?.note)&&<p className="mt-3 text-sm leading-6 text-[#637087]">{item.delayed?.note||item.immediate?.note}</p>}</article>)}</div>}</>; }
function Evidence({label,value}:{label:string;value:number|null}) { return <div className="rounded-xl bg-[#f4f7fb] p-3"><strong className="block text-lg">{value ?? "-"}</strong><small className="text-[#718099]">{label}</small></div>; }
function Psychologist({data,onChange}:{data:DashboardData;onChange:(next:DashboardData["access"])=>void}) { const access=data.access; const set=(patch:Partial<typeof access>)=>onChange({...access,...patch}); return <><ScreenHeading eyebrow="Психолог" title="Контроль доступа остаётся у вас" copy="Психолог сможет увидеть данные только после подключения и только в выбранном объёме."/><section className="surface mt-6 p-5 md:p-7"><div className="flex items-center justify-between gap-4"><div><h2 className="text-xl font-black">Делиться данными</h2><p className="mt-1 text-sm leading-6 text-[#718099]">Сейчас специалист не подключён</p></div><Switch checked={access.sharingEnabled} onCheckedChange={(checked)=>set({sharingEnabled:checked})} className="scale-125 data-[state=checked]:bg-[#16a58b]" aria-label="Включить доступ психолога"/></div></section><section className="surface mt-3 divide-y divide-[#e3e9f2] overflow-hidden">{[["shareProtocol","Личный протокол","Рабочие навыки и степень уверенности"],["shareAttempts","История практики","Попытки, выполнение и результаты"],["shareNotes","Личные заметки","Ваш текст после применения навыка"]].map(([key,title,copy])=><label key={key} className="flex min-h-20 items-center justify-between gap-4 p-5"><span><strong className="block">{title}</strong><small className="mt-1 block text-[#718099]">{copy}</small></span><Checkbox checked={access[key as keyof typeof access] as boolean} onCheckedChange={(checked)=>set({[key]:Boolean(checked)})} disabled={!access.sharingEnabled} /></label>)}</section><section className="mt-4 rounded-[24px] bg-[#132348] p-6 text-white"><p className="eyebrow text-[#9eb9f4]">Живая помощь</p><h2 className="mt-2 text-2xl font-black">Разобрать личную карту со специалистом</h2><p className="mt-3 max-w-xl leading-7 text-white/65">Бронирование и проверка квалификации специалистов появятся отдельным защищённым контуром. Здесь не будет случайного маркетплейса консультаций.</p></section></>; }
function OutcomeForm({outcome,setOutcome,onSave,busy}:{outcome:Outcome;setOutcome:React.Dispatch<React.SetStateAction<Outcome>>;onSave:()=>void;busy:boolean}) { return <div className="grid gap-5"><label className="flex items-start gap-3 rounded-2xl border border-[#dce4f0] bg-[#f8faff] p-4"><Checkbox checked={outcome.completed} onCheckedChange={(checked)=>setOutcome(o=>({...o,completed:Boolean(checked)}))}/><span><strong className="block">Мне удалось выполнить шаг</strong><small className="mt-1 block leading-5 text-[#718099]">Отметьте отдельно от того, стало ли легче.</small></span></label><Rating label="Стало легче или тяжелее?" value={outcome.reliefDelta} min={-5} max={5} left="Тяжелее" right="Легче" onChange={(value)=>setOutcome(o=>({...o,reliefDelta:value}))}/><Rating label="Насколько действие приблизило к цели?" value={outcome.goalProgress} min={0} max={10} left="Не приблизило" right="Приблизило" onChange={(value)=>setOutcome(o=>({...o,goalProgress:value}))}/><Rating label="Насколько навык был полезен?" value={outcome.helpfulness} min={0} max={10} left="Не получилось" right="Полезен" onChange={(value)=>setOutcome(o=>({...o,helpfulness:value}))}/><label className="flex items-start gap-3 rounded-2xl border border-[#dce4f0] bg-[#f8faff] p-4"><Checkbox checked={outcome.avoidance} onCheckedChange={(checked)=>setOutcome(o=>({...o,avoidance:Boolean(checked)}))}/><span><strong className="block">Это помогло избежать важного действия</strong><small className="mt-1 block leading-5 text-[#718099]">Отметьте, если стало легче, но проблема осталась нетронутой.</small></span></label><Textarea value={outcome.note} onChange={(e)=>setOutcome(o=>({...o,note:e.target.value}))} placeholder="Если не получилось, что помешало? Необязательно" className="min-h-20 rounded-xl"/><Button disabled={busy} onClick={onSave} className="h-13 rounded-xl bg-[#2868f5] text-base font-bold">{busy?"Сохраняем...":"Добавить в мой протокол"}</Button></div>; }
function Rating({label,value,min,max,left,right,onChange}:{label:string;value:number;min:number;max:number;left:string;right:string;onChange:(value:number)=>void}) { return <div><div className="mb-3 flex items-center justify-between gap-3"><strong>{label}</strong><span className="rounded-lg bg-[#eaf0ff] px-2 py-1 font-black text-[#2868f5]">{value}</span></div><Slider min={min} max={max} step={1} value={[value]} onValueChange={(values)=>onChange(values[0])}/><div className="mt-2 flex justify-between text-xs text-[#718099]"><span>{left}</span><span>{right}</span></div></div>; }
