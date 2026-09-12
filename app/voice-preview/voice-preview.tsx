"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronRight, CircleStop, Headphones, Mic, ShieldCheck, Sparkles, Target, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Mode = "story" | "situation";

const situationTranscript = "Вчера хотел написать знакомому и предложить встретиться. Подумал, что буду навязываться и что ему это неинтересно. Стало тревожно, я закрыл чат и весь вечер чувствовал одиночество.";
const storyTranscript = "Мне трудно заводить и поддерживать дружбу. Я часто думаю, что навязываюсь, поэтому жду инициативы от других. Хочу чаще общаться и самому предлагать встречи, но в моменте обычно закрываюсь.";

export function VoicePreview() {
  const [mode, setMode] = useState<Mode>("situation");
  const [step, setStep] = useState(0);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [transcript, setTranscript] = useState(situationTranscript);
  const [changePoint, setChangePoint] = useState("thought");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  function selectMode(next: Mode) {
    setMode(next);
    setTranscript(next === "situation" ? situationTranscript : storyTranscript);
    setStep(0);
  }

  async function startRecording() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => event.data.size && chunksRef.current.push(event.data);
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      };
      setSeconds(0);
      setRecording(true);
      recorder.start();
    } catch {
      setError("Не удалось получить доступ к микрофону. Можно посмотреть сценарий на готовом примере.");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  function clearRecording() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setSeconds(0);
  }

  function next() { setStep((value) => Math.min(3, value + 1)); }
  function back() { setStep((value) => Math.max(0, value - 1)); }

  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  const labels = mode === "situation" ? ["Запись", "Текст", "Цепочка", "Навык"] : ["Запись", "Текст", "Карта", "Следующий шаг"];

  return <main className="min-h-screen bg-[#f4f7fb] text-[#132348]">
    <header className="border-b border-[#dce4f0] bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-[1080px] items-center justify-between px-4 md:px-7">
        <Link href="/" className="flex items-center gap-3 font-black tracking-[.12em]"><span className="grid size-10 place-items-center rounded-2xl bg-[#132348] text-white">S</span> SKILLER</Link>
        <span className="rounded-full bg-[#fff3d6] px-3 py-1.5 text-xs font-black text-[#8b6417]">Прототип экранов</span>
      </div>
    </header>

    <div className="mx-auto grid max-w-[1080px] gap-6 px-4 py-6 md:grid-cols-[230px_minmax(0,1fr)] md:px-7 md:py-9">
      <aside className="surface h-fit p-3 md:sticky md:top-6">
        <p className="px-2 pb-3 pt-1 text-xs font-black uppercase tracking-[.1em] text-[#718099]">Голосовой сценарий</p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-1">
          <button onClick={() => selectMode("situation")} className={`rounded-xl p-3 text-left ${mode === "situation" ? "bg-[#eaf0ff] text-[#2459cc]" : "hover:bg-[#f4f7fb]"}`}><strong className="block text-sm">Конкретная ситуация</strong><small className="mt-1 block text-[#718099]">От события к навыку</small></button>
          <button onClick={() => selectMode("story")} className={`rounded-xl p-3 text-left ${mode === "story" ? "bg-[#eaf0ff] text-[#2459cc]" : "hover:bg-[#f4f7fb]"}`}><strong className="block text-sm">История в целом</strong><small className="mt-1 block text-[#718099]">Первичная карта целей</small></button>
        </div>
        <ol className="mt-4 hidden gap-1 border-t border-[#e3e9f2] pt-4 md:grid">
          {labels.map((label, index) => <li key={label} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold ${index === step ? "bg-[#132348] text-white" : index < step ? "text-[#087866]" : "text-[#8490a3]"}`}><span className={`grid size-7 place-items-center rounded-full ${index < step ? "bg-[#dff7f1]" : "bg-white/10"}`}>{index < step ? <Check className="size-4"/> : index + 1}</span>{label}</li>)}
        </ol>
      </aside>

      <section className="min-w-0">
        <div className="mb-4 flex items-center gap-2 md:hidden">{labels.map((label,index)=><span key={label} className={`h-2 flex-1 rounded-full ${index<=step?"bg-[#2868f5]":"bg-[#dce4f0]"}`} aria-label={label}/>)}</div>
        {step === 0 && <RecordScreen mode={mode} recording={recording} audioUrl={audioUrl} error={error} timer={`${minutes}:${secs}`} onStart={startRecording} onStop={stopRecording} onClear={clearRecording} onNext={next}/>} 
        {step === 1 && <TranscriptScreen transcript={transcript} onChange={setTranscript} onBack={back} onNext={next}/>} 
        {step === 2 && (mode === "situation" ? <ChainScreen changePoint={changePoint} onChangePoint={setChangePoint} onBack={back} onNext={next}/> : <MapScreen onBack={back} onNext={next}/>)}
        {step === 3 && (mode === "situation" ? <SkillScreen changePoint={changePoint} onBack={back}/> : <StoryNextScreen onBack={back} onSwitch={() => selectMode("situation")}/>)}
      </section>
    </div>
  </main>;
}

function RecordScreen({ mode, recording, audioUrl, error, timer, onStart, onStop, onClear, onNext }: { mode: Mode; recording: boolean; audioUrl: string | null; error: string; timer: string; onStart:()=>void; onStop:()=>void; onClear:()=>void; onNext:()=>void }) {
  const prompt = mode === "situation" ? "Что произошло в одном конкретном эпизоде?" : "Что сейчас больше всего мешает жить и что хотелось бы изменить?";
  return <div className="surface overflow-hidden"><div className="border-b border-[#e3e9f2] bg-white p-5 md:p-7"><p className="eyebrow">Шаг 1 · Голос</p><h1 className="mt-2 text-3xl font-black tracking-tight">{prompt}</h1><p className="mt-3 max-w-2xl leading-7 text-[#718099]">{mode === "situation" ? "Достаточно 30–90 секунд: событие, мысли, ощущения, что захотелось сделать и чем всё закончилось." : "Можно говорить свободно 2–5 минут. Система затем предложит короткое резюме для проверки."}</p></div>
    <div className="grid place-items-center px-5 py-9 text-center md:py-12">
      {!audioUrl ? <><button onClick={recording ? onStop : onStart} className={`relative grid size-32 place-items-center rounded-full text-white shadow-[0_20px_50px_rgba(40,104,245,.28)] transition ${recording ? "bg-[#c82c43]" : "bg-[#2868f5] hover:scale-[1.02]"}`} aria-label={recording ? "Остановить запись" : "Начать запись"}>{recording ? <CircleStop className="size-12"/> : <Mic className="size-12"/>}{recording && <span className="absolute -inset-3 animate-pulse rounded-full border-2 border-[#ef9daa]"/>}</button><strong className="mt-5 text-xl">{recording ? timer : "Нажмите и расскажите"}</strong><p className="mt-2 text-sm text-[#718099]">{recording ? "Запись идёт только в этом браузере" : "Микрофон включится после разрешения"}</p></> : <div className="w-full max-w-md"><span className="mx-auto grid size-16 place-items-center rounded-2xl bg-[#dff7f1] text-[#087866]"><Headphones className="size-7"/></span><h2 className="mt-4 text-xl font-black">Запись готова</h2><audio controls src={audioUrl} className="mt-4 w-full"/><button onClick={onClear} className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-[#9b3e4d]"><Trash2 className="size-4"/> Записать заново</button></div>}
      {error && <p role="alert" className="mt-5 max-w-md rounded-xl bg-[#fff1f3] p-3 text-sm text-[#9b3e4d]">{error}</p>}
      <div className="mt-8 flex flex-wrap justify-center gap-3"><Button variant="outline" onClick={onNext} className="h-12 rounded-xl px-5 font-bold">Посмотреть на примере</Button>{audioUrl && <Button onClick={onNext} className="h-12 rounded-xl bg-[#2868f5] px-5 font-bold">Продолжить <ArrowRight/></Button>}</div>
      <p className="mt-6 max-w-xl text-xs leading-5 text-[#8793a7]">В этом прототипе аудио не загружается и исчезает после закрытия страницы. На следующих экранах используется пример текста, чтобы оценить логику интерфейса.</p>
    </div>
  </div>;
}

function TranscriptScreen({ transcript, onChange, onBack, onNext }: { transcript:string; onChange:(value:string)=>void; onBack:()=>void; onNext:()=>void }) {
  return <div className="surface p-5 md:p-7"><p className="eyebrow">Шаг 2 · Подтверждение</p><h1 className="mt-2 text-3xl font-black tracking-tight">Правильно ли система поняла рассказ?</h1><p className="mt-3 leading-7 text-[#718099]">Это будущий экран после распознавания речи. Текст можно исправить до любого анализа.</p><div className="mt-6 rounded-2xl border border-[#d7e3fb] bg-[#f7f9ff] p-4"><div className="mb-3 flex items-center gap-2 text-sm font-bold text-[#2868f5]"><Sparkles className="size-4"/> Пример расшифровки</div><Textarea value={transcript} onChange={(event)=>onChange(event.target.value)} className="min-h-48 border-0 bg-white text-base leading-7 shadow-none"/></div><div className="mt-5 flex gap-3 rounded-2xl bg-[#effbf8] p-4 text-sm leading-6 text-[#426b64]"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#087866]"/><p><strong className="text-[#075f51]">Человек подтверждает исходные данные.</strong> AI не превращает ошибочную расшифровку в клинический вывод.</p></div><Nav onBack={onBack} onNext={onNext} nextLabel="Собрать черновик"/></div>;
}

function ChainScreen({ changePoint, onChangePoint, onBack, onNext }: { changePoint:string; onChangePoint:(value:string)=>void; onBack:()=>void; onNext:()=>void }) {
  const items = [["event","Ситуация","Хотел написать знакомому и предложить встретиться"],["thought","Мысль","«Я буду навязываться, ему это неинтересно»"],["feeling","Эмоция и тело","Тревога, напряжение в груди"],["urge","Импульс","Не писать и закрыть чат"],["action","Действие","Закрыл чат, инициативу не проявил"],["result","Последствие","Сразу легче; вечером сильнее одиночество"]];
  return <div className="surface p-5 md:p-7"><p className="eyebrow">Шаг 3 · Черновик цепочки</p><h1 className="mt-2 text-3xl font-black tracking-tight">Где можно изменить ход ситуации?</h1><p className="mt-3 leading-7 text-[#718099]">Система разложила рассказ на звенья. Нужно подтвердить смысл и выбрать точку, где действие ещё возможно.</p><div className="mt-6 grid gap-2">{items.map(([id,title,copy],index)=><button key={id} onClick={()=>["thought","urge","action"].includes(id)&&onChangePoint(id)} className={`grid w-full grid-cols-[34px_1fr_auto] items-start gap-3 rounded-2xl border p-4 text-left ${changePoint===id?"border-[#2868f5] bg-[#eef3ff]":"border-[#dce4f0] bg-white"}`}><span className={`grid size-8 place-items-center rounded-full text-sm font-black ${changePoint===id?"bg-[#2868f5] text-white":"bg-[#edf1f7] text-[#637087]"}`}>{index+1}</span><span><strong className="block">{title}</strong><small className="mt-1 block text-sm leading-6 text-[#718099]">{copy}</small></span>{["thought","urge","action"].includes(id)&&<span className={`mt-1 rounded-full px-2 py-1 text-xs font-bold ${changePoint===id?"bg-white text-[#2868f5]":"bg-[#f4f7fb] text-[#718099]"}`}>{changePoint===id?"Выбрано":"Можно изменить"}</span>}</button>)}</div><div className="mt-4 flex items-start gap-3 rounded-2xl bg-[#fff8e9] p-4 text-sm leading-6 text-[#76571f]"><ShieldCheck className="mt-0.5 size-5 shrink-0"/><p>В этом примере риск причинения вреда не указан. При признаках риска обычный подбор навыка остановится раньше этого экрана.</p></div><Nav onBack={onBack} onNext={onNext} nextLabel="Подобрать навык"/></div>;
}

function MapScreen({ onBack, onNext }: { onBack:()=>void; onNext:()=>void }) {
  return <div className="surface p-5 md:p-7"><p className="eyebrow">Шаг 3 · Первичная карта</p><h1 className="mt-2 text-3xl font-black tracking-tight">Вот что система услышала</h1><p className="mt-3 leading-7 text-[#718099]">Не диагноз, а проверяемая рабочая формулировка. Любой пункт можно изменить.</p><div className="mt-6 grid gap-3 sm:grid-cols-2"><MapCard label="Что мешает" value="Ожидание инициативы других и страх навязаться"/><MapCard label="Чего хочется" value="Регулярнее общаться и самому предлагать встречи"/><MapCard label="Повторяющийся момент" value="Закрываюсь перед отправкой сообщения"/><MapCard label="Первый фокус" value="Социальная инициатива без требования немедленно стать уверенным" accent/></div><div className="mt-5 rounded-2xl border border-[#dce4f0] p-4"><strong>Что пока неизвестно</strong><p className="mt-1 text-sm leading-6 text-[#718099]">Какие мысли, ощущения и действия возникают в конкретном эпизоде. Для навыка понадобится одна ситуация.</p></div><Nav onBack={onBack} onNext={onNext} nextLabel="Выбрать следующий шаг"/></div>;
}

function SkillScreen({ changePoint, onBack }: { changePoint:string; onBack:()=>void }) {
  const point = changePoint === "thought" ? "мысль перед закрытием чата" : changePoint === "urge" ? "импульс отказаться от контакта" : "действие перед закрытием чата";
  return <div className="surface overflow-hidden"><div className="bg-[#132348] p-6 text-white md:p-8"><div className="flex items-center justify-between gap-3"><span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-black uppercase tracking-[.08em]">DBT · регуляция эмоций</span><span className="text-sm text-white/60">3 минуты</span></div><p className="mt-8 text-sm text-[#9eb9f4]">Точка изменения: {point}</p><h1 className="mt-2 text-3xl font-black tracking-tight">Проверить факты перед отказом</h1><p className="mt-3 max-w-2xl leading-7 text-white/70">Не убеждать себя, что всё хорошо, а отделить наблюдаемые факты от прогноза «я навязываюсь».</p></div><div className="p-5 md:p-7"><ol className="grid gap-3">{[["Факт","Что известно о реакции знакомого прямо сейчас?"],["Предположение","Какая часть — прогноз, чтение мыслей или страх?"],["Эксперимент","Написать короткое сообщение без требования немедленного ответа."]].map(([title,copy],index)=><li key={title} className="grid grid-cols-[38px_1fr] gap-3 rounded-2xl bg-[#f4f7fb] p-4"><span className="grid size-9 place-items-center rounded-full bg-[#2868f5] font-black text-white">{index+1}</span><span><strong>{title}</strong><small className="mt-1 block text-sm leading-6 text-[#718099]">{copy}</small></span></li>)}</ol><div className="mt-5 rounded-2xl bg-[#effbf8] p-4"><strong className="text-[#087866]">Что измерим</strong><p className="mt-1 text-sm leading-6 text-[#426b64]">Удалось ли отправить сообщение, приблизило ли это к цели и не стало ли упражнение новым способом избегания.</p></div><div className="mt-7 flex flex-wrap items-center justify-between gap-3"><Button variant="ghost" onClick={onBack} className="h-12 rounded-xl"><ArrowLeft/> Назад</Button><Link href="/" className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#2868f5] px-5 font-bold text-white">Вернуться в SKILLER <ArrowRight className="size-4"/></Link></div></div></div>;
}

function StoryNextScreen({ onBack, onSwitch }: { onBack:()=>void; onSwitch:()=>void }) {
  return <div className="surface p-5 md:p-8"><span className="grid size-14 place-items-center rounded-2xl bg-[#dff7f1] text-[#087866]"><Target/></span><p className="eyebrow mt-6">Шаг 4 · Следующий шаг</p><h1 className="mt-2 text-3xl font-black tracking-tight">Теперь нужна одна реальная ситуация</h1><p className="mt-3 max-w-2xl leading-7 text-[#718099]">Общий рассказ определил направление, но не позволяет честно подобрать навык. Следующая запись должна описывать один эпизод: что произошло, что появилось внутри и что было сделано.</p><div className="mt-6 rounded-2xl bg-[#f0f5ff] p-5"><small className="font-black uppercase tracking-[.08em] text-[#2868f5]">Подходящий вопрос</small><p className="mt-2 text-lg font-bold">«Вспомните последний момент, когда хотелось написать человеку, но этого не произошло. Что случилось по шагам?»</p></div><div className="mt-7 flex flex-wrap items-center justify-between gap-3"><Button variant="ghost" onClick={onBack} className="h-12 rounded-xl"><ArrowLeft/> Назад</Button><Button onClick={onSwitch} className="h-12 rounded-xl bg-[#2868f5] px-5 font-bold">Записать ситуацию <Mic className="size-4"/></Button></div></div>;
}

function MapCard({ label, value, accent=false }: { label:string; value:string; accent?:boolean }) { return <article className={`rounded-2xl border p-4 ${accent?"border-[#b8d8d0] bg-[#effbf8]":"border-[#dce4f0] bg-white"}`}><small className={`font-black uppercase tracking-[.08em] ${accent?"text-[#087866]":"text-[#718099]"}`}>{label}</small><p className="mt-2 font-bold leading-6">{value}</p></article>; }

function Nav({ onBack, onNext, nextLabel }: { onBack:()=>void; onNext:()=>void; nextLabel:string }) { return <div className="mt-7 flex items-center justify-between gap-3"><Button variant="ghost" onClick={onBack} className="h-12 rounded-xl"><ArrowLeft/> Назад</Button><Button onClick={onNext} className="h-12 rounded-xl bg-[#2868f5] px-5 font-bold">{nextLabel} <ChevronRight className="size-4"/></Button></div>; }
