"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BrainCircuit, Check, ClipboardList, Dumbbell, Home, ShieldAlert, Sparkles, UserRound, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { DashboardData, SkillView } from "@/lib/skiller-data";

type Recommendation = { situationId: string; safetyStatus: "self-guided" | "escalate"; skill: SkillView | null };
type SkillSession = { skill: SkillView; mode: "help" | "practice"; situationId?: string; attemptId?: string };
type Outcome = { reliefDelta: number; goalProgress: number; helpfulness: number; avoidance: boolean; note: string };

const tabs = [
  ["today", "Сегодня", Home], ["help", "Сейчас", Zap], ["practice", "Практика", Dumbbell],
  ["protocol", "Протокол", ClipboardList], ["psychologist", "Психолог", UserRound],
] as const;

async function post(payload: Record<string, unknown>) {
  const response = await fetch("/api/skiller", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Не удалось сохранить данные");
  return data;
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
  const [intensity, setIntensity] = useState(6);
  const [risk, setRisk] = useState("no");
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [session, setSession] = useState<SkillSession | null>(null);
  const [phase, setPhase] = useState<"steps" | "result">("steps");
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [outcome, setOutcome] = useState<Outcome>({ reliefDelta: 0, goalProgress: 5, helpfulness: 5, avoidance: false, note: "" });

  const skills = useMemo(() => Object.fromEntries(data.skills.map((skill) => [skill.id, skill])), [data.skills]);
  const activeSkill = data.protocol[0]?.skillId ? skills[data.protocol[0].skillId] : skills["micro-start"] ?? data.skills[0];

  useEffect(() => {
    if (!session || phase !== "steps" || remaining <= 0) return;
    const timer = window.setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [session, phase, remaining]);

  const flash = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(""), 3200); };

  async function askForRecommendation(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setRecommendation(null);
    try { setRecommendation(await post({ action: "recommend", kind, description, intensity, risk })); }
    catch (error) { flash(error instanceof Error ? error.message : "Не удалось подобрать шаг"); }
    finally { setBusy(false); }
  }

  async function openSkill(skill: SkillView, mode: "help" | "practice", situationId?: string) {
    setBusy(true);
    try {
      const result = await post({ action: "start", skillId: skill.id, situationId, mode });
      setSession({ skill, mode, situationId, attemptId: result.attemptId });
      setRemaining(skill.durationSeconds); setPhase("steps");
      setOutcome({ reliefDelta: 0, goalProgress: 5, helpfulness: 5, avoidance: false, note: "" });
    } catch (error) { flash(error instanceof Error ? error.message : "Не удалось начать практику"); }
    finally { setBusy(false); }
  }

  async function saveOutcome() {
    if (!session?.attemptId) return; setBusy(true);
    try { setData(await post({ action: "complete", attemptId: session.attemptId, ...outcome })); setSession(null); setTab("protocol"); flash("Результат добавлен в личный протокол"); }
    catch (error) { flash(error instanceof Error ? error.message : "Не удалось сохранить результат"); }
    finally { setBusy(false); }
  }

  async function saveAccess(next: DashboardData["access"]) {
    const previous = data.access; setData((current) => ({ ...current, access: next }));
    try { await post({ action: "access", ...next }); }
    catch (error) { setData((current) => ({ ...current, access: previous })); flash(error instanceof Error ? error.message : "Не удалось изменить доступ"); }
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
        <TabsList orientation="vertical" className="fixed inset-x-2 bottom-2 z-40 grid h-auto w-auto grid-cols-5 rounded-2xl border border-[#dce4f0] bg-white/95 p-1.5 shadow-[0_16px_45px_rgba(19,35,72,.18)] backdrop-blur-xl md:sticky md:top-[104px] md:inset-auto md:flex md:h-fit md:w-full md:flex-col md:rounded-[22px] md:p-2 md:shadow-none">
          {tabs.map(([value, label, Icon]) => <TabsTrigger key={value} value={value} className="h-14 flex-col gap-1 rounded-xl px-1 text-[11px] data-[state=active]:bg-[#eaf0ff] data-[state=active]:text-[#2868f5] md:h-12 md:w-full md:flex-row md:justify-start md:gap-3 md:px-3 md:text-sm"><Icon className="size-[18px]" /> {label}</TabsTrigger>)}
        </TabsList>

        <main className="min-w-0">
          <TabsContent value="today"><Today data={data} activeSkill={activeSkill} onGo={setTab} onStart={openSkill} /></TabsContent>
          <TabsContent value="help">
            <ScreenHeading eyebrow="Помощь сейчас" title="Что происходит в этот момент?" copy="Одна ситуация, один посильный следующий шаг. Сначала система проверит безопасность." />
            <form onSubmit={askForRecommendation} className="surface mt-5 grid gap-6 p-5 md:p-7">
              <div><label className="field-title">На что это больше похоже?</label><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[["stuck","Я застрял"],["emotion","Сильная эмоция"],["conflict","Конфликт"],["other","Другое"]].map(([value,label]) => <button key={value} type="button" onClick={() => setKind(value)} className={`choice ${kind === value ? "choice-active" : ""}`}>{label}</button>)}</div></div>
              <div><label className="field-title" htmlFor="situation">Опишите момент одним-двумя предложениями</label><Textarea id="situation" value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-28 rounded-xl bg-[#f8faff] text-base" placeholder="Например: уже час смотрю на задачу и открываю новости вместо первого шага" /></div>
              <div><div className="mb-3 flex items-center justify-between"><label className="field-title mb-0">Насколько сильно накрывает?</label><strong className="text-[#2868f5]">{intensity} из 10</strong></div><Slider min={1} max={10} step={1} value={[intensity]} onValueChange={(value) => setIntensity(value[0])} /><div className="mt-2 flex justify-between text-xs text-[#718099]"><span>Можно думать</span><span>Очень сильно</span></div></div>
              <div className="rounded-2xl border border-[#dce4f0] bg-[#f8faff] p-4"><label className="field-title">Есть ли риск причинить вред себе или кому-то либо потерять контроль?</label><p className="mb-4 text-sm leading-6 text-[#718099]">Ответ определяет, может ли система продолжать самостоятельный сценарий.</p><RadioGroup value={risk} onValueChange={setRisk} className="grid grid-cols-2 gap-2">{[['no','Нет'],['yes','Да / не уверен']].map(([value,label]) => <label key={value} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 font-bold ${risk===value?'border-[#2868f5] bg-white text-[#2868f5]':'border-[#dce4f0]'}`}><RadioGroupItem value={value}/>{label}</label>)}</RadioGroup></div>
              <Button disabled={busy} className="h-13 rounded-xl bg-[#2868f5] text-base font-bold">{busy ? "Подбираем…" : "Подобрать следующий шаг"}</Button>
            </form>
            {recommendation?.safetyStatus === "escalate" && <SafetyCard />}
            {recommendation?.skill && <RecommendationCard recommendation={recommendation} busy={busy} onStart={openSkill} />}
          </TabsContent>
          <TabsContent value="practice"><Practice skills={data.skills} onStart={openSkill} /></TabsContent>
          <TabsContent value="protocol"><Protocol data={data} /></TabsContent>
          <TabsContent value="psychologist"><Psychologist data={data} onChange={saveAccess} /></TabsContent>
        </main>
      </div>

      <Sheet open={Boolean(session)} onOpenChange={(open) => !open && setSession(null)}>
        <SheetContent side="bottom" className="mx-auto max-h-[94vh] max-w-2xl overflow-y-auto rounded-t-[28px] border-[#dce4f0] px-5 pb-7 md:left-1/2 md:bottom-5 md:max-w-[680px] md:-translate-x-1/2 md:rounded-[28px] md:border">
          {session && <><SheetHeader className="px-0 pt-7"><p className="eyebrow">{phase === "steps" ? session.skill.approach : "Результат эксперимента"}</p><SheetTitle className="text-2xl font-black text-[#132348]">{phase === "steps" ? session.skill.title : "Что изменилось после навыка?"}</SheetTitle><SheetDescription className="text-base leading-6">{phase === "steps" ? session.skill.description : "Облегчение и движение к цели — разные показатели. Сохраним оба."}</SheetDescription></SheetHeader>{phase === "steps" ? <div><ol className="my-4 grid gap-2">{session.skill.steps.map((step, index) => <li key={step.title} className="grid grid-cols-[36px_1fr] gap-3 rounded-2xl bg-[#f4f7fb] p-3"><span className="grid size-9 place-items-center rounded-full bg-[#2868f5] font-black text-white">{index+1}</span><div><strong>{step.title}</strong><p className="mt-1 text-sm leading-6 text-[#718099]">{step.copy}</p></div></li>)}</ol><div className="my-5 text-center text-4xl font-black tabular-nums tracking-tight">{minutes}:{seconds}</div><Button onClick={() => setPhase("result")} className="h-13 w-full rounded-xl bg-[#132348] text-base font-bold">Я выполнил шаг <Check /></Button></div> : <OutcomeForm outcome={outcome} setOutcome={setOutcome} onSave={saveOutcome} busy={busy} />}</>}
        </SheetContent>
      </Sheet>
      {notice && <div role="status" className="fixed bottom-24 left-1/2 z-[70] w-[calc(100%-32px)] max-w-md -translate-x-1/2 rounded-xl bg-[#132348] px-4 py-3 text-center text-sm font-bold text-white shadow-2xl md:bottom-6">{notice}</div>}
    </Tabs>
  );
}

function ScreenHeading({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) { return <div><p className="eyebrow">{eyebrow}</p><h1 className="mt-2 text-3xl font-black tracking-[-.035em] md:text-4xl">{title}</h1><p className="mt-3 max-w-2xl text-base leading-7 text-[#718099]">{copy}</p></div>; }

function Today({ data, activeSkill, onGo, onStart }: { data: DashboardData; activeSkill?: SkillView; onGo: (tab:string)=>void; onStart: (skill:SkillView,mode:"practice")=>void }) { return <><ScreenHeading eyebrow="Сегодня" title="Что важно сегодня?" copy="Продолжите один эксперимент или разберите то, что происходит прямо сейчас." />{activeSkill && <section className="hero-card mt-6 overflow-hidden rounded-[28px] p-6 text-white md:p-8"><div className="relative z-10"><div className="flex flex-wrap items-center justify-between gap-2"><span className="pill bg-white/12 text-white">Активный эксперимент</span><span className="text-sm text-white/65">личная уверенность {data.protocol[0]?.confidence ?? 0}%</span></div><p className="mt-8 text-sm text-[#9eb9f4]">{activeSkill.track}</p><h2 className="mt-2 max-w-xl text-2xl font-black tracking-tight md:text-3xl">{activeSkill.title}</h2><p className="mt-3 max-w-xl leading-7 text-white/70">{activeSkill.description}</p><div className="mt-7 flex flex-wrap items-center justify-between gap-4"><span className="text-sm text-white/60">{data.stats.completions} завершённых проверок</span><Button onClick={() => onStart(activeSkill,"practice")} className="h-12 rounded-xl bg-white px-5 font-bold text-[#173674] hover:bg-white/90">Начать · {Math.ceil(activeSkill.durationSeconds/60)} мин</Button></div></div></section>}<div className="mt-4 grid gap-3 sm:grid-cols-2"><button onClick={()=>onGo("help")} className="quick-card border-[#cbdafd] bg-gradient-to-br from-white to-[#eef3ff]"><span className="quick-icon bg-[#e5ecff] text-[#2868f5]"><Zap/></span><span><strong>Помощь сейчас</strong><small>Разобрать текущую ситуацию</small></span><ArrowRight/></button><button onClick={()=>onGo("practice")} className="quick-card"><span className="quick-icon bg-[#dff7f1] text-[#087866]"><Dumbbell/></span><span><strong>Потренироваться</strong><small>Заранее, без сильного стресса</small></span><ArrowRight/></button></div><h2 className="mb-3 mt-8 text-xl font-black">Система становится точнее</h2><div className="grid gap-3 sm:grid-cols-3"><Metric value={data.stats.attempts} label="экспериментов" copy="в личной истории"/><Metric value={data.protocol.length} label="навыков в карте" copy="проверены на практике" accent/><Metric value={`${data.stats.completionRate}%`} label="выполнение" copy="из начатых попыток"/></div></>; }

function Metric({value,label,copy,accent=false}:{value:string|number;label:string;copy:string;accent?:boolean}) { return <article className={`surface min-h-36 p-5 ${accent ? "bg-[#eafaf6]" : ""}`}><strong className="text-3xl font-black">{value}</strong><span className="mt-2 block font-bold">{label}</span><small className="mt-5 block text-[#718099]">{copy}</small></article>; }
function SafetyCard() { return <section className="mt-4 flex gap-4 rounded-[24px] border border-[#efc6cd] bg-[#fff1f3] p-5"><span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#c82c43] text-white"><ShieldAlert/></span><div><p className="eyebrow text-[#b42036]">Нужна живая помощь</p><h2 className="mt-2 text-xl font-black">Автоматический подбор остановлен</h2><p className="mt-2 leading-7 text-[#714b54]">Перейдите в более безопасное место и свяжитесь с человеком, который может быть рядом. При непосредственной опасности обратитесь в местную экстренную службу.</p></div></section>; }
function RecommendationCard({ recommendation, busy, onStart }: { recommendation: Recommendation; busy:boolean; onStart:(skill:SkillView,mode:"help",situationId?:string)=>void }) { const skill = recommendation.skill!; return <section className="surface mt-4 p-5 md:p-7"><div className="flex items-center justify-between gap-3"><span className="pill bg-[#e8efff] text-[#2868f5]">Подходит к ситуации</span><span className="text-sm text-[#718099]">{Math.ceil(skill.durationSeconds/60)} мин</span></div><p className="eyebrow mt-6">{skill.approach}</p><h2 className="mt-2 text-2xl font-black">{skill.title}</h2><p className="mt-3 leading-7 text-[#627089]">{skill.description}</p><div className="my-5 rounded-2xl bg-[#f0f5ff] p-4"><strong>Почему сейчас</strong><p className="mt-1 text-sm leading-6 text-[#51658e]">{skill.why}</p></div><Button disabled={busy} onClick={()=>onStart(skill,"help",recommendation.situationId)} className="h-13 w-full rounded-xl bg-[#2868f5] text-base font-bold">Начать навык</Button></section>; }
function Practice({skills,onStart}:{skills:SkillView[];onStart:(skill:SkillView,mode:"practice")=>void}) { return <><ScreenHeading eyebrow="Тренировка" title="Навыки до сложного момента" copy="Короткие репетиции, чтобы нужное действие было доступно под нагрузкой."/><div className="mt-6 grid gap-3">{skills.map((skill,index)=><article key={skill.id} className={`surface grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-center ${index===0?'border-[#bfe8df] bg-gradient-to-br from-white to-[#effcf8]':''}`}><div><div className="flex items-center gap-2"><span className="pill bg-[#edf1f7] text-[#56647d]">{skill.track}</span>{index===0&&<span className="pill bg-[#dff7f1] text-[#087866]">Фокус</span>}</div><h2 className="mt-3 text-xl font-black">{skill.title}</h2><p className="mt-2 leading-6 text-[#718099]">{skill.description}</p></div><Button variant={index===0?'default':'outline'} onClick={()=>onStart(skill,"practice")} className={`h-11 rounded-xl font-bold ${index===0?'bg-[#132348]':''}`}>{Math.ceil(skill.durationSeconds/60)} мин <ArrowRight/></Button></article>)}</div><div className="mt-4 flex gap-3 rounded-2xl border border-dashed border-[#b8c7df] p-4 text-sm leading-6 text-[#637087]"><BrainCircuit className="mt-1 size-5 shrink-0 text-[#2868f5]"/><p><strong className="text-[#132348]">Навык считается освоенным не после просмотра.</strong> Нужны успешные применения в нескольких реальных ситуациях.</p></div></>; }
function Protocol({data}:{data:DashboardData}) { return <><ScreenHeading eyebrow="Мой протокол" title="Что работает именно для вас" copy="Не диагноз и не тип личности — карта проверенных действий и границ их применимости."/>{data.protocol.length===0?<section className="surface mt-6 p-8 text-center"><Sparkles className="mx-auto size-10 text-[#2868f5]"/><h2 className="mt-4 text-xl font-black">Карта начнёт формироваться после первой практики</h2><p className="mx-auto mt-2 max-w-md leading-7 text-[#718099]">Система учитывает не только облегчение, но и движение к цели и риск избегания.</p></section>:<div className="mt-6 grid gap-3">{data.protocol.map((item)=><article key={item.skillId} className="surface border-l-4 border-l-[#2868f5] p-5"><div className="flex items-start justify-between gap-3"><div><span className={`text-xs font-black uppercase tracking-[.08em] ${item.status==='working'?'text-[#087866]':'text-[#2868f5]'}`}>{item.status==='working'?'Работает':'Проверяем'}</span><h2 className="mt-1 text-xl font-black">{item.title}</h2><p className="mt-1 text-sm text-[#718099]">{item.track}</p></div><span className="rounded-xl bg-[#eaf0ff] px-3 py-2 font-black text-[#2868f5]">{item.confidence}%</span></div><div className="mt-5 grid grid-cols-3 gap-2 text-center"><Evidence label="Польза" value={item.helpfulness}/><Evidence label="К цели" value={item.goalProgress}/><Evidence label="Облегчение" value={item.relief}/></div><p className="mt-4 text-sm leading-6 text-[#637087]">{item.completions} применений · избегание отмечено {item.avoidanceCount} раз</p></article>)}</div>}</>; }
function Evidence({label,value}:{label:string;value:number|null}) { return <div className="rounded-xl bg-[#f4f7fb] p-3"><strong className="block text-lg">{value ?? "—"}</strong><small className="text-[#718099]">{label}</small></div>; }
function Psychologist({data,onChange}:{data:DashboardData;onChange:(next:DashboardData["access"])=>void}) { const access=data.access; const set=(patch:Partial<typeof access>)=>onChange({...access,...patch}); return <><ScreenHeading eyebrow="Психолог" title="Контроль доступа остаётся у вас" copy="Психолог сможет увидеть данные только после подключения и только в выбранном объёме."/><section className="surface mt-6 p-5 md:p-7"><div className="flex items-center justify-between gap-4"><div><h2 className="text-xl font-black">Делиться данными</h2><p className="mt-1 text-sm leading-6 text-[#718099]">Сейчас специалист не подключён</p></div><Switch checked={access.sharingEnabled} onCheckedChange={(checked)=>set({sharingEnabled:checked})} className="scale-125 data-[state=checked]:bg-[#16a58b]" aria-label="Включить доступ психолога"/></div></section><section className="surface mt-3 divide-y divide-[#e3e9f2] overflow-hidden">{[["shareProtocol","Личный протокол","Рабочие навыки и степень уверенности"],["shareAttempts","История практики","Попытки, выполнение и результаты"],["shareNotes","Личные заметки","Ваш текст после применения навыка"]].map(([key,title,copy])=><label key={key} className="flex min-h-20 items-center justify-between gap-4 p-5"><span><strong className="block">{title}</strong><small className="mt-1 block text-[#718099]">{copy}</small></span><Checkbox checked={access[key as keyof typeof access] as boolean} onCheckedChange={(checked)=>set({[key]:Boolean(checked)})} disabled={!access.sharingEnabled} /></label>)}</section><section className="mt-4 rounded-[24px] bg-[#132348] p-6 text-white"><p className="eyebrow text-[#9eb9f4]">Живая помощь</p><h2 className="mt-2 text-2xl font-black">Разобрать личную карту со специалистом</h2><p className="mt-3 max-w-xl leading-7 text-white/65">Бронирование и проверка квалификации специалистов появятся отдельным защищённым контуром. Здесь не будет случайного маркетплейса консультаций.</p></section></>; }

function OutcomeForm({outcome,setOutcome,onSave,busy}:{outcome:Outcome;setOutcome:React.Dispatch<React.SetStateAction<Outcome>>;onSave:()=>void;busy:boolean}) { return <div className="grid gap-5"><Rating label="Стало легче или тяжелее?" value={outcome.reliefDelta} min={-5} max={5} left="Тяжелее" right="Легче" onChange={(value)=>setOutcome(o=>({...o,reliefDelta:value}))}/><Rating label="Насколько действие приблизило к цели?" value={outcome.goalProgress} min={0} max={10} left="Не приблизило" right="Приблизило" onChange={(value)=>setOutcome(o=>({...o,goalProgress:value}))}/><Rating label="Насколько навык был полезен?" value={outcome.helpfulness} min={0} max={10} left="Не полезен" right="Полезен" onChange={(value)=>setOutcome(o=>({...o,helpfulness:value}))}/><label className="flex items-start gap-3 rounded-2xl border border-[#dce4f0] bg-[#f8faff] p-4"><Checkbox checked={outcome.avoidance} onCheckedChange={(checked)=>setOutcome(o=>({...o,avoidance:Boolean(checked)}))}/><span><strong className="block">Это помогло избежать важного действия</strong><small className="mt-1 block leading-5 text-[#718099]">Отметьте, если стало легче, но проблема осталась нетронутой.</small></span></label><Textarea value={outcome.note} onChange={(e)=>setOutcome(o=>({...o,note:e.target.value}))} placeholder="Что сработало или помешало? Необязательно" className="min-h-20 rounded-xl"/><Button disabled={busy} onClick={onSave} className="h-13 rounded-xl bg-[#2868f5] text-base font-bold">{busy?"Сохраняем…":"Добавить в мой протокол"}</Button></div>; }
function Rating({label,value,min,max,left,right,onChange}:{label:string;value:number;min:number;max:number;left:string;right:string;onChange:(value:number)=>void}) { return <div><div className="mb-3 flex items-center justify-between gap-3"><strong>{label}</strong><span className="rounded-lg bg-[#eaf0ff] px-2 py-1 font-black text-[#2868f5]">{value}</span></div><Slider min={min} max={max} step={1} value={[value]} onValueChange={(values)=>onChange(values[0])}/><div className="mt-2 flex justify-between text-xs text-[#718099]"><span>{left}</span><span>{right}</span></div></div>; }
