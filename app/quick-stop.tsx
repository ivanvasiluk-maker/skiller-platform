"use client";

import { StopExample } from "./stop-example";

export function QuickStop({ onPractice, practiceLabel, disabled = false }: {
  onPractice?: () => void;
  practiceLabel?: string;
  disabled?: boolean;
}) {
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
    {onPractice && <div className="trainer-actions">
      <button type="button" className="trainer-secondary" disabled={disabled} onClick={onPractice}>{practiceLabel ?? "Разобрать свою ситуацию с тренером"}</button>
      <p>Чтение примера не записывается как попытка. Результат можно сохранить в карточке личной практики после её начала.</p>
    </div>}
    <p>При непосредственной опасности нужна живая помощь: <a href="tel:112">112 в ЕС</a>. Приложение не вызывает помощь автоматически.</p>
  </details>;
}
