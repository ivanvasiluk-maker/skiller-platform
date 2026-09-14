# Round 2.4b — auditable transfer across contexts

Дата: 2026-09-14  
Issue: #23

## Пользовательский эффект

SKILLER может предложить проверку уже полезного навыка в другом типе ситуации и явно маркирует это как transfer, а не обычный repeat.

## Контракт transfer

`transfer_helpful` возможен только одновременно при следующих фактах:

1. safety разрешает самостоятельную практику;
2. базовый подбор независимо выбрал тот же skill для текущего `situation.kind`;
3. same-kind outcome отсутствует — он всегда имеет приоритет;
4. последний outcome этого skill в другом `kind` завершён;
5. helpfulness не ниже 6/10;
6. avoidance не увеличился.

Если последний cross-kind outcome не проходит условия, он не используется для transfer. Система делает `first_try` для нового контекста.

## Реализация

- добавлен reason code `transfer_helpful`;
- policy version повышена до `outcome-policy-v2`;
- TypeScript и Python используют общий fixture;
- D1 decision возвращает `evidenceContextKind` для аудита;
- reason code и version сохраняются существующим путём в situation и trainer plan;
- пользовательский текст называет перенос экспериментом и не заявляет доказанный эффект.

## Проверка

Unit-тесты проверяют общую политику на TypeScript и Python. Реальный D1 integration-сценарий сохраняет helpful outcome в `conflict`, запрашивает тот же independently eligible skill для `stuck` и ожидает `transfer_helpful` с источником `conflict`.

## Не входит в раунд

- LLM-сходство свободного текста;
- перенос после failed/low-fit evidence;
- Day 7 recap;
- деплой.
