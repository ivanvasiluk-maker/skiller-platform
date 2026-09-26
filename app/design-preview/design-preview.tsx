"use client";

import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  House,
  MessageCircle,
  Mic,
  MoreHorizontal,
  Pause,
  Play,
  Send,
  Settings,
  Shield,
  Sparkles,
  UserRound,
} from "lucide-react";

type ScreenId =
  | "welcome"
  | "coach"
  | "home"
  | "chat"
  | "analysis"
  | "practice"
  | "result"
  | "return"
  | "journal"
  | "profile"
  | "critical";

type CoachId = "marsha" | "beck" | "skinny";

const screens: { id: ScreenId; label: string; group: string }[] = [
  { id: "welcome", label: "Старт", group: "Знакомство" },
  { id: "coach", label: "Тренер", group: "Знакомство" },
  { id: "home", label: "Сегодня", group: "Основное" },
  { id: "chat", label: "Разговор", group: "Основное" },
  { id: "analysis", label: "Разбор", group: "Основное" },
  { id: "practice", label: "Практика", group: "Основное" },
  { id: "result", label: "Результат", group: "Основное" },
  { id: "return", label: "Возвращение", group: "Продолжение" },
  { id: "journal", label: "Дневник", group: "Продолжение" },
  { id: "profile", label: "Профиль", group: "Настройки" },
  { id: "critical", label: "Критическая помощь", group: "По кнопке" },
];

const coaches = {
  marsha: {
    name: "Марша",
    role: "Бережная опора",
    color: "#257461",
    soft: "#dff1e9",
    accent: "#ffbd6b",
    symbol: "◡",
    phrase: "Сначала найдём опору. Потом — один посильный шаг.",
  },
  beck: {
    name: "Бек",
    role: "Спокойный анализ",
    color: "#4b65a5",
    soft: "#e7ebfa",
    accent: "#93a8ea",
    symbol: "◇",
    phrase: "Отделим факт от мысли и проверим одну гипотезу.",
  },
  skinny: {
    name: "Скинни",
    role: "Импульс к действию",
    color: "#b75735",
    soft: "#fae7da",
    accent: "#f3a06f",
    symbol: "↗",
    phrase: "Не тащим всю задачу. Запускаем первые две минуты.",
  },
} as const;

function Character({ coachId, mood = "calm", size = "normal" }: { coachId: CoachId; mood?: "calm" | "talk" | "happy" | "thinking"; size?: "small" | "normal" | "large" }) {
  const coach = coaches[coachId];
  return (
    <div className={`dp-character ${size} ${mood}`} style={{ "--coach": coach.color, "--soft": coach.soft, "--accent": coach.accent } as React.CSSProperties} aria-label={`${coach.name}, ${coach.role}`}>
      <span className="dp-ear left" />
      <span className="dp-ear right" />
      <span className="dp-eye left" />
      <span className="dp-eye right" />
      <span className="dp-mouth">{coach.symbol}</span>
      <span className="dp-cheek left" />
      <span className="dp-cheek right" />
    </div>
  );
}

function PhoneHeader({ coachId, title, subtitle, back }: { coachId: CoachId; title: string; subtitle?: string; back?: () => void }) {
  return (
    <header className="dp-phone-header">
      {back ? <button className="dp-icon" onClick={back} aria-label="Назад"><ArrowLeft size={20} /></button> : <Character coachId={coachId} size="small" mood="happy" />}
      <div><strong>{title}</strong>{subtitle && <span>{subtitle}</span>}</div>
      <button className="dp-icon" aria-label="Дополнительно"><MoreHorizontal size={21} /></button>
    </header>
  );
}

function BottomNav({ active, onSelect }: { active: "home" | "chat" | "journal" | "profile"; onSelect: (screen: ScreenId) => void }) {
  const items = [
    ["home", "Сегодня", House],
    ["chat", "Тренер", MessageCircle],
    ["journal", "Дневник", BookOpen],
    ["profile", "Профиль", UserRound],
  ] as const;
  return <nav className="dp-bottom-nav">{items.map(([id, label, Icon]) => <button key={id} className={active === id ? "active" : ""} onClick={() => onSelect(id)}><Icon size={20}/><span>{label}</span></button>)}</nav>;
}

function Welcome({ next }: { next: () => void }) {
  return <div className="dp-screen dp-welcome">
    <div className="dp-brand">skiller<span>●</span></div>
    <div className="dp-character-stage">
      <Character coachId="beck" size="normal" mood="thinking" />
      <Character coachId="marsha" size="large" mood="happy" />
      <Character coachId="skinny" size="normal" mood="talk" />
    </div>
    <p className="dp-eyebrow">ТРЕНЕР НАВЫКОВ НА КАЖДЫЙ ДЕНЬ</p>
    <h1>Когда трудно —<br/>не оставайтесь<br/>с этим один на один.</h1>
    <p className="dp-lead">Расскажите, что происходит. Мы разберём ситуацию и сразу попробуем один маленький шаг.</p>
    <button className="dp-primary" onClick={next}>Начать знакомство <ArrowRight size={18}/></button>
    <p className="dp-legal">Не психотерапия и не экстренная помощь</p>
  </div>;
}

function CoachChoice({ coachId, setCoachId, next }: { coachId: CoachId; setCoachId: (id: CoachId) => void; next: () => void }) {
  return <div className="dp-screen dp-scroll">
    <div className="dp-topline"><button className="dp-icon"><ArrowLeft size={20}/></button><span>2 из 3</span></div>
    <p className="dp-eyebrow">ВЫБЕРИТЕ ХАРАКТЕР</p>
    <h1>Кто будет рядом?</h1>
    <p className="dp-lead">Тренера можно сменить позже. Память и прогресс сохранятся.</p>
    <div className="dp-coach-list">{(Object.keys(coaches) as CoachId[]).map(id => { const coach = coaches[id]; return <button key={id} onClick={() => setCoachId(id)} className={`dp-coach-card ${coachId === id ? "selected" : ""}`} style={{ "--coach": coach.color, "--soft": coach.soft } as React.CSSProperties}>
      <Character coachId={id} mood={coachId === id ? "happy" : "calm"}/><span className="dp-coach-copy"><small>{coach.role}</small><strong>{coach.name}</strong><span>{coach.phrase}</span></span>{coachId === id && <span className="dp-check"><Check size={15}/></span>}
    </button>; })}</div>
    <div className="dp-sticky-action"><button className="dp-primary" onClick={next}>Продолжить с {coaches[coachId].name === "Марша" ? "Маршей" : coaches[coachId].name === "Бек" ? "Беком" : "Скинни"} <ArrowRight size={18}/></button></div>
  </div>;
}

function HomeScreen({ coachId, go }: { coachId: CoachId; go: (id: ScreenId) => void }) {
  const coach = coaches[coachId];
  return <div className="dp-screen dp-scroll dp-with-nav">
    <div className="dp-home-top"><div className="dp-brand compact">skiller<span>●</span></div><button className="dp-icon"><Bell size={20}/><i/></button></div>
    <section className="dp-daily-card" style={{ "--coach": coach.color, "--soft": coach.soft } as React.CSSProperties}>
      <div><p className="dp-eyebrow">ПЯТНИЦА · ДЕНЬ 4</p><h1>Иван, как Вы<br/>сегодня?</h1><p>{coach.phrase}</p></div><Character coachId={coachId} size="large" mood="talk" />
    </section>
    <button className="dp-resume" onClick={() => go("return")}><span><small>ПРОДОЛЖИТЬ ВЧЕРАШНЕЕ</small><strong>Открыть отчёт и написать заголовок</strong><em>Около 2 минут</em></span><ChevronRight/></button>
    <h2>С чего начнём?</h2>
    <div className="dp-action-grid">
      <button onClick={() => go("chat")}><span className="mint"><MessageCircle/></span><strong>Расскажу,<br/>что происходит</strong></button>
      <button onClick={() => go("practice")}><span className="peach"><Play/></span><strong>Хочу сразу<br/>попробовать навык</strong></button>
      <button onClick={() => go("analysis")}><span className="blue"><Sparkles/></span><strong>Разобрать<br/>ситуацию</strong></button>
      <button onClick={() => go("critical")}><span className="rose"><Shield/></span><strong>Нужна срочная<br/>опора</strong><small>Только по Вашей кнопке</small></button>
    </div>
    <div className="dp-week"><span><strong>3</strong><small>дня подряд</small></span>{["Пн","Вт","Ср","Чт","Пт","Сб","Вс"].map((d,i)=><i className={i<4?"done":i===4?"today":""} key={d}>{i<4?<Check size={12}/>:d}</i>)}</div>
    <BottomNav active="home" onSelect={go}/>
  </div>;
}

function ChatScreen({ coachId, go }: { coachId: CoachId; go: (id: ScreenId) => void }) {
  const coach = coaches[coachId];
  return <div className="dp-screen dp-chat dp-with-composer">
    <PhoneHeader coachId={coachId} title={coach.name} subtitle="на связи · помнит контекст" back={() => go("home")}/>
    <div className="dp-chat-date">Сегодня</div>
    <div className="dp-bubble coach"><Character coachId={coachId} size="small" mood="talk"/><p>Иван, расскажите, что сейчас происходит. Можно своими словами — я помогу собрать главное.</p></div>
    <div className="dp-bubble user"><p>Нужно закончить отчёт, но я уже час смотрю видео и никак не начинаю.</p></div>
    <div className="dp-bubble coach"><Character coachId={coachId} size="small" mood="thinking"/><p>Похоже, начало отчёта вызывает напряжение, а видео помогает его ненадолго не чувствовать. Что Вам сейчас нужнее?</p></div>
    <div className="dp-quick"><button onClick={() => go("analysis")}>Понять, где застрял</button><button onClick={() => go("practice")}>Сразу сделать первый шаг</button><button>Спросить своими словами</button></div>
    <div className="dp-composer"><button className="dp-icon"><Mic size={21}/></button><span>Сообщение тренеру…</span><button className="dp-send"><Send size={18}/></button></div>
  </div>;
}

function AnalysisScreen({ coachId, go }: { coachId: CoachId; go: (id: ScreenId) => void }) {
  const coach = coaches[coachId];
  return <div className="dp-screen dp-scroll dp-with-composer">
    <PhoneHeader coachId={coachId} title="Разбор ситуации" subtitle="вопрос 2 из 4" back={() => go("chat")}/>
    <div className="dp-progress"><i/><i className="active"/><i/><i/></div>
    <div className="dp-guide"><Character coachId={coachId} mood="thinking"/><div><small>{coach.name}</small><p>Не будем заполнять анкету. Я задам по одному вопросу и соберу цепочку вместе с Вами.</p></div></div>
    <section className="dp-question-card">
      <span className="dp-question-number">02</span><p className="dp-eyebrow">МОМЕНТ ПЕРЕД ОТВЛЕЧЕНИЕМ</p><h1>Что Вы сказали себе, когда открыли отчёт?</h1><p className="dp-hint">Например: «Я не знаю, с чего начать» или «Сделаю плохо».</p>
      <button className="dp-answer">Я подумал, что отчёт получится плохим</button><button className="dp-answer empty">Написать другой ответ</button>
    </section>
    <div className="dp-chain-preview"><small>СОБИРАЕМ ЦЕПОЧКУ</small><span><b>Отчёт</b><i>→</i><b className="active">«Сделаю плохо»</b><i>→</i><b>напряжение</b></span></div>
    <div className="dp-sticky-action"><button className="dp-primary" onClick={() => go("practice")}>Продолжить <ArrowRight size={18}/></button><button className="dp-text-button">Не уверен — пояснить вопрос</button></div>
  </div>;
}

function PracticeScreen({ coachId, go }: { coachId: CoachId; go: (id: ScreenId) => void }) {
  const coach = coaches[coachId];
  return <div className="dp-screen dp-scroll">
    <PhoneHeader coachId={coachId} title="Практика" subtitle="можно остановиться раньше" back={() => go("chat")}/>
    <div className="dp-practice-hero" style={{ "--coach": coach.color, "--soft": coach.soft } as React.CSSProperties}>
      <Character coachId={coachId} size="large" mood="happy"/><p className="dp-eyebrow">ОДИН ШАГ · 2 МИНУТЫ</p><h1>Откройте отчёт.<br/>Больше пока ничего.</h1><p>Напишите мне, когда файл будет открыт. Продолжать отчёт сейчас не обязательно.</p>
    </div>
    <section className="dp-instruction"><span>1</span><div><strong>Закройте видео</strong><p>Не навсегда — только на время этой попытки.</p></div></section>
    <section className="dp-instruction"><span>2</span><div><strong>Откройте нужный файл</strong><p>Остановитесь, как только увидите первую страницу.</p></div></section>
    <div className="dp-timer"><button><Play size={20}/></button><span><strong>02:00</strong><small>мягкий таймер</small></span><i/></div>
    <button className="dp-primary" onClick={() => go("result")}>Файл открыт <Check size={18}/></button>
    <button className="dp-secondary">Шаг не подходит</button>
    <p className="dp-center-note">Можно задать вопрос тренеру в любой момент</p>
  </div>;
}

function ResultScreen({ coachId, go }: { coachId: CoachId; go: (id: ScreenId) => void }) {
  return <div className="dp-screen dp-scroll">
    <PhoneHeader coachId={coachId} title="Как получилось?" back={() => go("practice")}/>
    <div className="dp-celebrate"><div className="dp-confetti"/><Character coachId={coachId} size="large" mood="happy"/><h1>Попытка уже считается.</h1><p>Здесь нет правильного ответа. Нам важен фактический результат.</p></div>
    <div className="dp-result-list"><button className="success"><Check/><span><strong>Получилось</strong><small>Файл открыт, шаг завершён</small></span><ChevronRight/></button><button><Pause/><span><strong>Частично</strong><small>Начал, но остановился</small></span><ChevronRight/></button><button onClick={() => go("analysis")}><CircleHelp/><span><strong>Не получилось</strong><small>Посмотрим, где оборвалась цепочка</small></span><ChevronRight/></button><button><MoreHorizontal/><span><strong>Другой результат</strong><small>Расскажу своими словами</small></span><ChevronRight/></button></div>
    <p className="dp-center-note">Если не получилось, SKILLER не выдаст новый случайный навык — сначала уточнит причину.</p>
  </div>;
}

function ReturnScreen({ coachId, go }: { coachId: CoachId; go: (id: ScreenId) => void }) {
  return <div className="dp-screen dp-return">
    <div className="dp-brand compact">skiller<span>●</span></div>
    <Character coachId={coachId} size="large" mood="talk"/>
    <p className="dp-eyebrow">ПРОДОЛЖАЕМ, А НЕ НАЧИНАЕМ ЗАНОВО</p><h1>Иван, доброе утро.</h1><p className="dp-lead">Вчера Вы хотели открыть отчёт и написать первый заголовок. Получилось?</p>
    <div className="dp-return-actions"><button onClick={() => go("result")}>Да, получилось <Check/></button><button onClick={() => go("analysis")}>Только частично <Pause/></button><button onClick={() => go("analysis")}>Нет, не сделал <CircleHelp/></button><button>Хочу ответить иначе <MessageCircle/></button></div>
    <button className="dp-text-button" onClick={() => go("home")}>Сейчас не хочу отвечать</button>
  </div>;
}

function JournalScreen({ coachId, go }: { coachId: CoachId; go: (id: ScreenId) => void }) {
  return <div className="dp-screen dp-scroll dp-with-nav">
    <PhoneHeader coachId={coachId} title="Дневник" subtitle="около 40 секунд"/>
    <section className="dp-journal-head"><p className="dp-eyebrow">ПЯТНИЦА · 25 СЕНТЯБРЯ</p><h1>Как прошёл день?</h1><p>Не анализируем всё. Отметьте первое ощущение.</p></section>
    {[['Настроение',6,'спокойнее'],['Энергия',4,'мало сил'],['Отвлекаемость',8,'часто']].map(([label,value,note])=><label className="dp-metric" key={label as string}><span><strong>{label}</strong><b>{value}/10</b></span><input type="range" min="0" max="10" defaultValue={value as number}/><small>{note}</small></label>)}
    <label className="dp-thought"><span>Мысль дня <small>необязательно</small></span><textarea placeholder="Что хочется запомнить?"/></label>
    <button className="dp-primary">Сохранить день <Check size={18}/></button>
    <section className="dp-insight"><Sparkles/><div><small>НАБЛЮДЕНИЕ ЗА 4 ДНЯ</small><p>Когда энергия ниже 5, начать рабочую задачу было сложнее. В такие дни можно сразу выбирать самый короткий шаг.</p></div></section>
    <BottomNav active="journal" onSelect={go}/>
  </div>;
}

function ProfileScreen({ coachId, go }: { coachId: CoachId; go: (id: ScreenId) => void }) {
  return <div className="dp-screen dp-scroll dp-with-nav">
    <PhoneHeader coachId={coachId} title="Профиль"/>
    <div className="dp-profile-card"><Character coachId={coachId} mood="happy"/><div><strong>Иван</strong><span>SK-000184</span><small>Тренер: {coaches[coachId].name}</small></div><button className="dp-icon"><Settings/></button></div>
    <h2>Напоминания</h2>
    <div className="dp-settings-list"><label><span><Bell/><b>Вернуться к договорённости</b><small>Завтра в 09:30</small></span><input type="checkbox" defaultChecked/></label><label><span><BookOpen/><b>Заполнить дневник</b><small>Каждый день в 20:00</small></span><input type="checkbox" defaultChecked/></label></div>
    <h2>Язык</h2><div className="dp-language"><button><span>Интерфейс</span><strong>Русский</strong><ChevronRight/></button><button><span>Разговор с тренером</span><strong>Как пишу сейчас</strong><ChevronRight/></button></div>
    <p className="dp-privacy">Имя не используется в исследовательской выгрузке. Для пилота применяется внутренний ID.</p>
    <BottomNav active="profile" onSelect={go}/>
  </div>;
}

function CriticalScreen({ coachId, go }: { coachId: CoachId; go: (id: ScreenId) => void }) {
  return <div className="dp-screen dp-critical">
    <button className="dp-icon" onClick={() => go("home")}><ArrowLeft/></button>
    <Character coachId={coachId} size="large" mood="calm"/>
    <p className="dp-eyebrow">РЕЖИМ ОТКРЫТ ВАМИ</p><h1>Сейчас важна опора.</h1><p className="dp-lead">Вы сами открыли этот экран. Я не буду автоматически расспрашивать. Выберите, что сейчас полезнее.</p>
    <div className="dp-critical-actions"><button><span>1</span><strong>Сделать короткое заземление</strong><ChevronRight/></button><button><span>2</span><strong>Связаться с человеком рядом</strong><ChevronRight/></button><button><span>3</span><strong>Посмотреть контакты срочной помощи</strong><ChevronRight/></button></div>
    <p className="dp-emergency">Если есть непосредственная опасность, обратитесь в местную экстренную службу. SKILLER не является экстренной службой.</p>
  </div>;
}

export function DesignPreview() {
  const [screen, setScreen] = useState<ScreenId>("welcome");
  const [coachId, setCoachId] = useState<CoachId>("marsha");
  const current = screens.find(item => item.id === screen)!;
  const go = (id: ScreenId) => setScreen(id);
  return <main className="dp-lab">
    <aside className="dp-sidebar">
      <div className="dp-lab-brand"><span>SK</span><div><strong>UX prototype</strong><small>Раунд 1 · без backend</small></div></div>
      <div className="dp-screen-menu">{[...new Set(screens.map(s => s.group))].map(group => <section key={group}><p>{group}</p>{screens.filter(s => s.group === group).map(item => <button key={item.id} className={screen === item.id ? "active" : ""} onClick={() => go(item.id)}><span>{String(screens.indexOf(item)+1).padStart(2,'0')}</span>{item.label}<ChevronRight size={15}/></button>)}</section>)}</div>
      <div className="dp-review-note"><strong>Что утверждаем</strong><span>Стиль · персонажи · навигацию · тексты · порядок экранов</span></div>
    </aside>
    <section className="dp-workspace">
      <header className="dp-lab-header"><div><span>{current.group}</span><h2>{current.label}</h2></div><p><b>Прототип.</b> Данные не сохраняются.</p></header>
      <div className="dp-device-wrap"><div className="dp-device"><div className="dp-notch"/>
        {screen === "welcome" && <Welcome next={() => go("coach")}/>} 
        {screen === "coach" && <CoachChoice coachId={coachId} setCoachId={setCoachId} next={() => go("home")}/>} 
        {screen === "home" && <HomeScreen coachId={coachId} go={go}/>} 
        {screen === "chat" && <ChatScreen coachId={coachId} go={go}/>} 
        {screen === "analysis" && <AnalysisScreen coachId={coachId} go={go}/>} 
        {screen === "practice" && <PracticeScreen coachId={coachId} go={go}/>} 
        {screen === "result" && <ResultScreen coachId={coachId} go={go}/>} 
        {screen === "return" && <ReturnScreen coachId={coachId} go={go}/>} 
        {screen === "journal" && <JournalScreen coachId={coachId} go={go}/>} 
        {screen === "profile" && <ProfileScreen coachId={coachId} go={go}/>} 
        {screen === "critical" && <CriticalScreen coachId={coachId} go={go}/>} 
      </div></div>
      <div className="dp-desktop-note"><Sparkles size={17}/><span>Макет показан в мобильном размере — основной сценарий проектируем сначала для телефона, затем адаптируем на компьютер.</span></div>
    </section>
  </main>;
}
