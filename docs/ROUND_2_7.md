# Round 2.7 — continuity при смене trainer/mode

Статус: реализация подготовлена в отдельной ветке; merge только после зелёного Verify.

## Пользовательский эффект

Пользователь меняет тренера или стиль общения и продолжает с того же места. Смена настроек не переписывает день, планы, outcomes и исторические события.

## Реализация

- settings update и change events выполняются одним D1 batch;
- unchanged settings не создают мутаций и событий;
- trainer_changed и interaction_mode_changed сохраняют точные from/to;
- оба события привязаны к итоговому trainer и текущему day index;
- UI и persona prompts не меняются.

## Доказательство

Локальный D1 integration scenario сохраняет до смены:

- profile с исходным created_at;
- completed trainer plan с result=done и helpfulness=8;
- outcome с completion/helpfulness/avoidance;
- историческое событие Day 2.

После одновременной смены Marsha/support → Beck/direct сценарий проверяет:

- day остаётся Day 4;
- plan id/result/helpfulness неизменны;
- outcome неизменен;
- историческое событие остаётся у Marsha на Day 2;
- новые change events содержат точные from/to и итогового trainer Beck.

## Не сделано в этом раунде

- UI redesign;
- изменение Character Bible или prompts;
- browser E2E;
- deployment.

## Следующий вход

После merge: отдельный малый раунд на повторный outcome idempotency и avoidance integration branch.
