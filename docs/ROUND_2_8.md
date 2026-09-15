# Round 2.8 — idempotent outcome и avoidance D1

Статус: реализация подготовлена; merge только после зелёного Verify.

## Найденный дефект

Unique index уже запрещал две строки outcomes для одного attempt. Однако failed attempt сохранял status=attempted, поэтому повторный вызов completeAttempt второй раз увеличивал personal_skill_evidence, хотя insert outcome подавлялся конфликтом.

## Исправление

- completeAttempt проверяет существующий outcome по user_id + attempt_id до любой мутации;
- повторный вызов возвращает сохранённый dashboard без изменения attempt, outcome и evidence;
- существующая unique-защита outcomes.attempt_id остаётся последним DB-ограничителем.

## D1-доказательство идемпотентности

Один failed outcome отправляется дважды для одной попытки. После двух вызовов:

- outcomes count = 1;
- attempt status = attempted;
- evidence attempts = 1;
- completions = 0;
- helpful_sum = 4;
- goal_sum = 0;
- avoidance_count = 0.

## D1-доказательство avoidance

Отдельный сценарий сохраняет completed=true, helpfulness=8, avoidance=true. Ожидаемый результат:

- reason_code = replace_low_fit;
- исходный навык не повторяется;
- выбирается distract-delay;
- safety и остальные policy-сценарии не меняются.

## Не сделано

- concurrent crash recovery между независимыми D1-командами;
- изменение UI;
- browser E2E;
- deployment.

## Следующий вход

После merge: финальная сверка reason explanation в UI либо закрытие оставшихся Stage 0 version/env задач.
