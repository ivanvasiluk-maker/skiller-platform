/** An illustrative example, never a substitute for the saved personal action. */
export function MicroStartExample({ plannedAction }: { plannedAction: string | null }) {
  return <aside className="micro-start-example" aria-label="Пример выполнения микро-старта">
    <span className="trainer-kicker">КАК ЭТО ВЫГЛЯДИТ НА ПРИМЕРЕ</span>
    <p><strong>Ситуация:</strong> нужно написать отчёт, но трудно начать.</p>
    <p><strong>Маленький шаг:</strong> открыть документ для этого отчёта и написать один черновой заголовок.</p>
    <p><strong>Что получилось:</strong> в документе появился заголовок. На этом можно остановиться — весь отчёт сейчас заканчивать не нужно.</p>
    <div className="micro-start-personal">
      <strong>Теперь Ваша ситуация</strong>
      {plannedAction
        ? <><p>Ваша договорённость: «{plannedAction}».</p><p>Пример про отчёт только показывает размер шага. Выполните своё действие. Если оно пока слишком большое или непонятное, напишите об этом тренеру в разговоре.</p></>
        : <p>Это пример, а не задание открыть какой-то файл. Напишите тренеру, какое дело Вы откладываете: вместе уточним, что именно сделать первым.</p>}
    </div>
  </aside>;
}
