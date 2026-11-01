"use client";

import { useState } from "react";
import { StopExample } from "./stop-example";

export function QuickStop({ onPractice, onPrepare, practiceLabel, disabled = false }: {
  onPrepare?: (input: { text: string; intensity: number; risk: "no" | "yes" | "unknown"; urge: "avoid" | "distract" | "attack" | "withdraw" }) => Promise<boolean>;
  onPractice?: () => void;
  practiceLabel?: string;
  disabled?: boolean;
}) {
  const [personalText, setPersonalText] = useState("");
  const [intensity, setIntensity] = useState<number | null>(null);
  const [risk, setRisk] = useState<"no" | "yes" | "unknown" | "">("");
  const [urge, setUrge] = useState<"avoid" | "distract" | "attack" | "withdraw" | "">("");
  return <details className="quick-stop">
    <summary>Нужна пауза? Открыть STOP</summary>
    <h2>Пауза перед действием</h2>
    <p>Например, пришло неприятное сообщение и хочется резко ответить. Если сейчас безопасно остановиться, попробуйте:</p>
    <ol>
      <li><strong>Остановиться.</strong> Пока не нажимайте «Отправить».</li>
      <li><strong>Сделать шаг назад.</strong> Отложите телефон на короткое время. Дышите как удобно.</li>
      <li><strong>Наблюдать.</strong> «Я замечаю злость и желание ответить сразу». Отделите текст сообщения от своих предположений.</li>
      <li><strong>Действовать осознанно.</strong> Выберите ответ, который поможет Вашей цели. Например: «Мне нужно немного времени. Отвечу позже».</li>
    </ol>
    <StopExample />
    <p>Теперь примените эти шаги к своей ситуации. Можно остановиться на любом шаге и закрыть карточку.</p>
    {onPrepare && <form className="trainer-composer" onSubmit={async event => {
      event.preventDefault();
      if (disabled || personalText.trim().length < 3 || intensity === null || !risk || !urge) return;
      if (await onPrepare({ text: personalText.trim(), intensity, risk, urge })) setPersonalText("");
    }}>
      <label className="trainer-label">Перед каким действием Вам нужна пауза?
        <textarea className="trainer-input" rows={2} maxLength={1200} value={personalText} onChange={event => setPersonalText(event.target.value)} />
      </label>
      <label className="trainer-label">Насколько сильное состояние сейчас, от 0 до 10?
        <input className="trainer-input" type="number" min={0} max={10} step={1} value={intensity ?? ""} onChange={event => { const value = event.target.valueAsNumber; setIntensity(Number.isInteger(value) && value >= 0 && value <= 10 ? value : null); }} />
      </label>
      <label className="trainer-label">Что сейчас хочется сделать?
        <select className="trainer-input" value={urge} onChange={event => setUrge(event.target.value as typeof urge)}>
          <option value="">Выберите</option><option value="attack">Резко ответить или действовать</option><option value="withdraw">Замкнуться или уйти</option><option value="avoid">Избежать ситуации</option><option value="distract">Отвлечься</option>
        </select>
      </label>
      <label className="trainer-label">Есть ли сейчас риск причинить вред себе или другому?
        <select className="trainer-input" value={risk} onChange={event => setRisk(event.target.value as typeof risk)}>
          <option value="">Выберите</option><option value="no">Нет</option><option value="yes">Да</option><option value="unknown">Не уверен(а)</option>
        </select>
      </label>
      <button type="submit" className="trainer-secondary" disabled={disabled || personalText.trim().length < 3 || intensity === null || !risk || !urge}>Подготовить мою практику</button>
      <p>Сначала появится личная карточка. Попытка сохраняется после нажатия «Начать действие», результат — по Вашему ответу. Если STOP раньше не помог, тренер может предложить другой шаг.</p>
    </form>}
    {onPractice && <div className="trainer-actions">
      <button type="button" className="trainer-secondary" disabled={disabled} onClick={onPractice}>{practiceLabel ?? "Разобрать свою ситуацию с тренером"}</button>
      <p>Чтение примера не записывается как попытка. Результат можно сохранить в карточке личной практики после её начала.</p>
    </div>}
    <p>При непосредственной опасности нужна живая помощь: <a href="tel:112">112 в ЕС</a>. Приложение не вызывает помощь автоматически.</p>
  </details>;
}
