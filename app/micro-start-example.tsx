/** An illustrative example, never a substitute for the saved personal action. */
export function MicroStartExample({ plannedAction }: { plannedAction: string | null }) {
  return <details className="micro-start-example">
    <summary>Показать пример: маленький шаг для отчёта</summary>
    <p><strong>Ситуация:</strong> нужно написать отчёт, но трудно начать.</p>
    <p><strong>Маленький шаг:</strong> открыть документ для этого отчёта и написать один черновой заголовок.</p>
    <p><strong>Что получилось:</strong> в документе появился заголовок. На этом можно остановиться — весь отчёт сейчас заканчивать не нужно.</p>
    <div className="micro-start-personal">
      <strong>Теперь своя ситуация</strong>
      {plannedAction
        ? <><p>Договорённость: «{plannedAction}».</p><p>Пример про отчёт только показывает размер шага. Теперь можно выполнить своё действие. Если оно пока слишком большое или непонятное, можно сообщить об этом тренеру в разговоре.</p></>
        : <p>Это пример, а не задание открыть какой-то файл. Можно назвать тренеру дело, которое пока откладывается: вместе уточним, что именно сделать первым.</p>}
    </div>
  </details>;
}
