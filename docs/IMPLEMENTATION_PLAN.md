# SKILLER — план реализации Frozen MVP

Дата: 2026-09-12  
Основание: `SKILLER — FROZEN MVP SPEC v1.0` и [FROZEN_MVP_AUDIT.md](FROZEN_MVP_AUDIT.md).

## 1. Цель релиза

За 7 дней пользователь должен:

1. выбрать одного из трех тренеров;
2. принести реальную ситуацию;
3. получить безопасное микро-действие из зарегистрированного Skill Engine;
4. выполнить или честно не выполнить действие;
5. увидеть, что система помнит результат;
6. повторить полезное, уменьшить или заменить неудачное действие;
7. получить grounded recap на Day 3 и Day 7.

Главный проверяемый результат — связь:

`отношение с тренером → реальное действие → память результата → добровольное возвращение`.

## 2. Границы проекта

### Входит во Frozen MVP

- три стабильных AI-тренера;
- onboarding и выбор interaction mode;
- Situation → Safety → Skill → Attempt → Outcome;
- память результатов и continuity Day 2–7;
- repeat, transfer, resize и replacement;
- Free Talk с управляемым выходом к действию;
- Day 3/7 recap;
- backend analytics и Google Sheets mirror;
- тестируемый fallback при недоступности AI;
- пилот 5 человек и когорта 20–30 человек.

### Не входит до снятия freeze

- полноценный кабинет психолога;
- marketplace и booking;
- realtime voice;
- новые большие курсы и все 372 навыка;
- социальные функции;
- сложная геймификация, 3D и награды ради наград;
- монетизация, мешающая недельному тесту;
- новые диагностические тесты.

## 3. Порядок реализации

Оценка предполагает одного разработчика с доступом к Cloudflare, OpenAI и тестовой Google-таблице. Общий технический путь: **15–21 рабочий день**, затем два последовательных продуктовых теста.

| Этап | Результат | Оценка | Зависит от |
|---|---|---:|---|
| 0 | Зафиксирован baseline и CI-гейты | 1 день | — |
| 1 | Outcome влияет на следующий шаг | 3–4 дня | 0 |
| 2 | Полный continuity Day 1–7 | 3–4 дня | 1 |
| 3 | Pilot analytics и Google Sheets | 3–4 дня | 1 |
| 4 | Character Bible и safety/fallback | 2–3 дня | 1 |
| 5 | Integration/E2E и release hardening | 3–5 дней | 2–4 |
| 6 | Пилот 5 → когорта 20–30 | 8–14 календарных дней | 5 |

## 4. Этап 0 — baseline и рабочий контур

**Цель:** каждое следующее изменение проверяется одинаково и не ломает уже работающий цикл.

### Задачи

- [ ] Добавить scripts `typecheck`, `test:core`, `test:integration`, `test:e2e`, `verify` в `package.json`.
- [ ] Настроить CI: install → lint → typecheck → unit/integration → build.
- [ ] Создать отдельную тестовую D1-базу и тестовые bindings.
- [ ] Зафиксировать `PRODUCT_VERSION`, `CHARACTER_VERSION`, версии skill cards в событиях.
- [ ] Добавить seed/reset только для тестовой среды.
- [ ] Описать обязательные env/bindings без публикации секретов.

### Приемка

- `npm run verify` выполняется одной командой;
- CI проходит на чистом checkout;
- production и test D1 физически разделены;
- секреты отсутствуют в client bundle и Git.

## 5. Этап 1 — outcome-aware Skill Engine

**Цель:** прошлый результат меняет следующее предложение, но не обходит safety и eligibility.

### Модель решения

Для совместимой новой ситуации:

- `completed=true` и `helpfulness >= 6` → предложить повторение навыка;
- успешные применения в новом контексте → предложить transfer;
- `completed=false` → предложить resize или replacement;
- `helpfulness <= 3` либо рост avoidance → не повторять автоматически;
- один результат не переводит навык в статус «работает»;
- safety и contraindications всегда выше персональной истории.

### Задачи

- [ ] Выделить чистую функцию ranking/selection без запросов к БД.
- [ ] Перед подбором читать evidence, последний outcome и совместимые контексты.
- [ ] Добавить reason codes: `repeat_helpful`, `transfer`, `resize_after_failed`, `replace_low_fit`, `first_try`.
- [ ] Сохранять reason code и version решения в plan/event.
- [ ] Не учитывать abandoned attempt как completion.
- [ ] Сделать повторный outcome идемпотентным.
- [ ] Добавить интеграционные тесты successful repeat, failed replacement, low helpfulness, avoidance и safety override.

### Приемка

- полезный навык повторяется в совместимой ситуации;
- failed/low-fit навык не повторяется автоматически;
- UI объясняет причину следующего шага;
- решение воспроизводимо по сохраненным данным;
- DoD D закрыт, G переведен минимум в «реализовано для repeat/replace».

## 6. Этап 2 — continuity Day 1–7

**Цель:** тренер помнит факты и результаты, а не имитирует память общими фразами.

### Задачи

- [ ] Определить day state: `day_index`, `last_action`, `last_outcome`, `open_loop`, `next_check_at`.
- [ ] Day 2: коротко напомнить действие Day 1 и спросить фактический результат.
- [ ] Day 3: recap из attempts/outcomes/events с маркировкой неизвестного.
- [ ] Days 4–6: выбирать repeat, transfer, resize или replacement по evidence.
- [ ] Day 7: недельный recap, рабочая гипотеза, ограничения уверенности и следующий эксперимент.
- [ ] Возврат после пропуска: без стыда и потери прогресса.
- [ ] Смена trainer/mode: сохранять plans, outcomes, events и day state.
- [ ] Добавить overdue/open-loop карточку на главный экран.

### Приемка

- Day 2 ссылается на конкретный сохраненный outcome Day 1;
- recap не содержит причин, которых нет в данных;
- reload/restart не меняет day state;
- пропуск дня не сбрасывает маршрут;
- DoD E, F, G, H и K закрыты автоматическими сценариями.

## 7. Этап 3 — аналитика пилота

**Цель:** продуктовая команда считает retention и action completion без доступа к production DB; сбой экспорта не влияет на пользователя.

### Схема

Primary storage — D1. Google Sheets — только псевдонимизированное аналитическое зеркало.

### Задачи

- [ ] Добавить `cohorts` и cohort attribution пользователя.
- [ ] Зафиксировать event schema и обязательные payload-поля.
- [ ] Проверить наличие всех событий Frozen Spec.
- [ ] Создать export queue: `pending`, `processing`, `sent`, `failed`, `retry_at`, `attempts`.
- [ ] Реализовать server-side append/upsert в Sheets.
- [ ] Добавить exponential backoff и dead-letter logging.
- [ ] Не экспортировать тексты психологических разговоров и заметок.
- [ ] Создать вкладки USERS, EVENTS, DAILY, FEEDBACK, COHORTS.
- [ ] Подготовить SQL/скрипт для D2, D3, D7 engaged retention и action completion.
- [ ] Добавить сверку количества D1 events и экспортированных строк.

### Приемка

- пользовательский запрос успешен при недоступном Google API;
- повторная отправка не создает дубли;
- таблица не содержит email, имени и полного текста разговоров;
- D2/D3/D7 и completion считаются вручную по cohort;
- DoD L, M и N закрыты.

## 8. Этап 4 — персонажи, AI и safety

**Цель:** персонажи различимы, стабильны и не получают права менять клиническую политику.

### Задачи

- [ ] Создать Character Bible для Марши, Бека и Скинни.
- [ ] Для каждого описать tone, structure, allowed moves, forbidden moves, success/failure/return patterns.
- [ ] Версионировать Bible и сохранять version в событиях.
- [ ] Валидировать структурированный AI output через Zod.
- [ ] Ограничить Free Talk: 2–4 предложения, один вопрос, явный переход к действию.
- [ ] Проверить deterministic fallback для onboarding, situation analysis и Free Talk.
- [ ] Добавить adversarial safety cases для всех трех персонажей.
- [ ] Проверить отсутствие guilt, fake urgency, dependency language и диагностических утверждений.

### Приемка

- один и тот же сценарий дает различимый стиль, но одинаковую safety/skill policy;
- невалидный или недоступный AI не ломает flow;
- персонаж не может выдать незарегистрированный навык;
- DoD B, I и J покрыты сценарными тестами.

## 9. Этап 5 — тесты и release hardening

**Цель:** доказать Definition of Done до приглашения реальных пользователей.

### Integration tests

- [ ] onboarding и сохранение выбора тренера;
- [ ] done/more/failed и раздельные completion/helpfulness;
- [ ] duplicate request и повторный outcome;
- [ ] safety escalation и возврат из safety flow;
- [ ] repeat/transfer/resize/replacement;
- [ ] смена персонажа и режима без потери данных;
- [ ] analytics event completeness;
- [ ] Sheets retry без влияния на API response;
- [ ] AI timeout, malformed output и deterministic fallback.

### E2E Day 1–7

- [ ] новый пользователь проходит onboarding;
- [ ] Day 1 выполняет или не выполняет действие;
- [ ] reload и restart сохраняют состояние;
- [ ] Day 2 видит continuity;
- [ ] Day 3 получает grounded recap;
- [ ] Days 4–6 проходят repeat/transfer/replacement;
- [ ] Day 7 получает недельный recap и feedback;
- [ ] смена персонажа не теряет progress;
- [ ] сценарий проходит при отключенном OpenAI;
- [ ] mobile и desktop не имеют перекрытий и недоступных действий.

### Release checklist

- [ ] миграции применяются на копии production schema;
- [ ] rollback проверен;
- [ ] CSP/origin/body-size/rate-limit проверены;
- [ ] логи не содержат чувствительный текст;
- [ ] accessibility: keyboard, focus, labels, contrast;
- [ ] `lint`, `typecheck`, tests и `build` проходят;
- [ ] API key отсутствует в client bundle;
- [ ] smoke test развернутой версии пройден.

### Приемка

- DoD A–P закрыты доказательствами;
- нет P0/P1 дефектов;
- P2 допускаются только с обходным путем и записью в backlog.

## 10. Этап 6 — продуктовый тест

### Волна 1: moderated pilot, 5 человек

Срок: 3–5 дней.

- наблюдать onboarding, первое действие, возврат и recap;
- фиксировать только blockers и UX defects внутри frozen scope;
- не добавлять новые продуктовые ветки по единичным пожеланиям;
- после каждого исправления повторять smoke и regression suite.

**Gate:** минимум 4 из 5 проходят основной цикл без помощи разработчика; нет потери данных и safety-инцидентов.

### Волна 2: 20–30 человек, 7 дней

- один product version и заранее заданная cohort;
- ежедневный мониторинг ошибок и полноты событий;
- Day 3/7 feedback: полезность, understood, желание продолжить, что помогло, что мешало;
- изменения во время когорты — только P0/P1 fixes с новой version отметкой.

### Решение после когорты

Оценить:

- D2/D3/D7 engaged retention;
- action start и action completion;
- voluntary returns;
- feeling understood;
- desire to continue;
- качественные причины возврата и отказа;
- различия между персонажами без причинных выводов на малой выборке.

Если сигнал есть — снять freeze и выбрать следующий эксперимент. Если сигнала нет — найти разрыв в цепочке `relationship → action → memory → return`, не маскируя его новыми функциями.

## 11. Порядок задач в ближайших спринтах

### Спринт 1 — честная адаптация

1. Pure ranking function.
2. Outcome-aware repeat/replacement.
3. Reason codes и persistence.
4. Integration tests решения.
5. Общий `npm run verify`.

### Спринт 2 — недельная память

1. Day state и open loop.
2. Day 2 continuation.
3. Days 4–6 transfer/repeat.
4. Проверка Day 3/7 recap.
5. Reload/restart tests.

### Спринт 3 — измеримый пилот

1. Cohorts.
2. Export queue.
3. Google Sheets mirror.
4. Метрики и reconciliation.
5. Privacy review.

### Спринт 4 — release candidate

1. Character Bible tests.
2. AI fallback/adversarial safety.
3. E2E Day 1–7.
4. Mobile/desktop QA.
5. Deploy и smoke test.

## 12. Рабочие правила

- одна задача — один проверяемый пользовательский эффект;
- сначала тест, способный опровергнуть гипотезу, затем расширение реализации;
- safety и deterministic policy не зависят от персонажа и LLM;
- UI, API, persistence, event и тест обновляются в одном slice;
- никакая функция не считается готовой только по наличию экрана;
- любое расширение за пределы Frozen Spec записывается в backlog и не реализуется до decision gate;
- после каждого этапа обновляются аудит, DoD-матрица и product version.
