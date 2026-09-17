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
- [x] Создать отдельную тестовую D1-базу и тестовые bindings.
- [x] Зафиксировать `PRODUCT_VERSION`, `CHARACTER_VERSION`, версии skill cards во всех обязательных событиях (Round 0.1 Event Versions).
- [x] Добавить seed/reset только для тестовой среды.
- [x] Описать обязательные env/bindings без публикации секретов (Round 3.2: `docs/ENVIRONMENT.md`).

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

- [x] Выделить чистую outcome-policy функцию без запросов к БД (Round 1.1; подключение ranking к D1 — Round 1.2).
- [x] Перед подбором читать последний outcome для совместимого контекста и текущего eligible-навыка.
- [x] Добавить reason codes: `repeat_helpful`, `transfer_helpful`, `resize_after_failed`, `replace_low_fit`, `first_try` (Round 2.4b).
- [x] Сохранять reason code и version решения в situation/plan/event.
- [x] Объяснять следующий шаг в UI из сохранённого reason code без повторного вывода из outcome-полей (Round 2.9).
- [x] Не учитывать abandoned attempt как completion.
- [x] Сделать повторный outcome идемпотентным (Round 2.8).
- [x] Добавить интеграционные тесты successful repeat, failed replacement, low helpfulness, avoidance и safety override (Rounds 1.2–2.8).

### Приемка

- полезный навык повторяется в совместимой ситуации;
- failed/low-fit навык не повторяется автоматически;
- UI объясняет причину следующего шага;
- решение воспроизводимо по сохраненным данным;
- DoD D закрыт, G переведен минимум в «реализовано для repeat/replace».

## 6. Этап 2 — continuity Day 1–7

**Цель:** тренер помнит факты и результаты, а не имитирует память общими фразами.

### Задачи

- [x] Определить day state: `day_index`, `last_action`, `last_outcome`, `open_loop`, `next_check_at` (Round 2.1).
- [x] Day 2: коротко напомнить действие Day 1 и спросить фактический результат (Round 2.2).
- [x] Day 3: recap из attempts/outcomes/events с маркировкой неизвестного (Round 2.3).
- [x] Days 4–6: выбирать repeat, transfer, resize или replacement по evidence (Rounds 2.4a–2.4b).
  - [x] Карточка возврата repeat/resize/replacement использует outcome-policy и требует новый контекст (Round 2.4a).
  - [x] Transfer между контекстами: отдельный `transfer_helpful` и доказуемая совместимость (Round 2.4b).
- [x] Day 7: недельный recap, рабочая гипотеза, ограничения уверенности и следующий эксперимент (Round 2.5).
- [x] Возврат после пропуска: без стыда, сброса дня и потери open-loop/progress (Round 2.6).
- [x] Смена trainer/mode: сохранять plans, outcomes, events и day state (Round 2.7).
- [x] Добавить overdue/open-loop карточку на главный экран (Round 2.1).

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

- [x] Добавить `cohorts` и cohort attribution пользователя (Round 3.1: ключ cohort = UTC-день первого события + product version, автоприсвоение при первом pilot event).
- [x] Зафиксировать event schema и обязательные payload-поля (Round 3.1: `lib/pilot-event-schema.ts`, 27 событий Frozen Spec).
- [x] Проверить наличие всех событий Frozen Spec (Round 3.1: unit-тест покрывает обязательный перечень).
- [x] Создать export queue: `pending`, `processing`, `sent`, `failed`, `retry_at`, `attempts` (Round 3.1: таблица `export_queue` + `lib/export-queue.ts`).
- [x] Реализовать server-side append/upsert в Sheets (Round 3.2: `lib/sheets-exporter.ts` + `app/api/export/route.ts`; EVENTS/FEEDBACK — append с dedupe по event_id, USERS — upsert, DAILY/COHORTS — snapshot).
- [x] Добавить exponential backoff и dead-letter logging (Round 3.1: backoff 60s×2^n, dead-letter после 8 попыток).
- [x] Не экспортировать тексты психологических разговоров и заметок (Round 3.1: `minimizePayloadForExport` allowlist без text/note/description; Round 3.2: D1 integration проверяет отсутствие приватного текста в листе).
- [x] Создать вкладки USERS, EVENTS, DAILY, FEEDBACK, COHORTS (Round 3.2: `lib/sheets-schema.ts` + auto-header).
- [x] Подготовить SQL/скрипт для D2, D3, D7 engaged retention и action completion (Round 3.1: `scripts/pilot-metrics.mjs`, `npm run pilot:metrics`).
- [x] Добавить сверку количества D1 events и экспортированных строк (Round 3.1: `npm run pilot:reconcile`).

### Приемка

- пользовательский запрос успешен при недоступном Google API;
- повторная отправка не создает дубли;
- таблица не содержит email, имени и полного текста разговоров;
- D2/D3/D7 и completion считаются вручную по cohort;
- DoD L, M и N закрыты.

## 8. Этап 4 — персонажи, AI и safety

**Цель:** персонажи различимы, стабильны и не получают права менять клиническую политику.

### Задачи

- [x] Создать Character Bible для Марши, Бека и Скинни (Round 4.1: `lib/character-bible.ts`).
- [x] Для каждого описать tone, structure, allowed moves, forbidden moves, success/failure/return patterns (Round 4.1).
- [x] Версионировать Bible и сохранять version в событиях (Round 4.1: `CHARACTER_BIBLE_VERSION` = `character_version` = 1.1 в payload каждого события).
- [x] Валидировать структурированный AI output через Zod (существовало; Round 4.1 добавил пост-проверку содержимого).
- [x] Ограничить Free Talk: 2–4 предложения, один вопрос, явный переход к действию (Round 4.1: `validateTrainerReply` — пост-проверка, нарушение → fallback).
- [x] Проверить deterministic fallback для onboarding, situation analysis и Free Talk (Round 4.1: fallback из Bible; situation analysis возвращает null без ключа → детерминированный разбор).
- [x] Добавить adversarial safety cases для всех трех персонажей (Round 4.1: инъекции, «я человек», давление срочностью — отклоняются guard'ом; safety routing персонаж-независим).
- [x] Проверить отсутствие guilt, fake urgency, dependency language и диагностических утверждений (Round 4.1: лексические запреты в guard + unit-кейсы).

### Приемка

- один и тот же сценарий дает различимый стиль, но одинаковую safety/skill policy;
- невалидный или недоступный AI не ломает flow;
- персонаж не может выдать незарегистрированный навык;
- DoD B, I и J покрыты сценарными тестами.

## 9. Этап 5 — тесты и release hardening

**Цель:** доказать Definition of Done до приглашения реальных пользователей.

### Integration tests

- [x] onboarding и сохранение выбора тренера (Round 5.1: D1 integration `/onboarding-flow` — 4 события онбординга версионированы, trainer/mode в профиле, когорта приписана);
- [x] done/more/failed и раздельные completion/helpfulness (Round 5.1: D1 integration `/outcome-semantics` — done/more → completed=1 + helpfulness, failed → completed=0, статус attempted);
- [x] duplicate request и повторный outcome (D1 integration, Rounds 1.2 и 2.8);
- [x] safety escalation и возврат из safety flow (Round 5.1: D1 integration `/safety-cycle` — routing по тексту и risk-ответу, статичное safety-сообщение, снятие флага, события safety_flow_used/safety_check_completed);
- [x] repeat/transfer/resize/replacement (Round 5.2: D1 integration `/adjustment-cycle` — полный цикл через trainerCommand: first_try → failed → resize (1 шаг, ≤60с) → failed → replace (другой навык трека) → done → repeat_helpful; transfer из другого типа ситуации; события action_resized/action_replaced/skill_recommended полны по реестру);
- [x] смена персонажа и режима без потери данных (D1 integration, Round 2.7);
- [x] analytics event completeness (Round 5.1: event-schema-v2, валидатор `eventPayloadComplete`, D1 integration `/event-completeness` — 8 событий против реестра из 32, контрпример отклонён);
- [x] Sheets retry без влияния на API response (Round 3.2: D1 integration — «Google API 503» → failed + backoff, retry доставляет без дублей; экспорт отдельным процессом от пользовательского API);
- [x] AI timeout, malformed output и deterministic fallback (Round 5.1: `lib/free-talk.ts` с инъецируемым fetch, D1 integration `/ai-fallback` — timeout/malformed/hostile → fallback из Bible, валидный ответ проходит).

### E2E Day 1–7

- [x] новый пользователь проходит onboarding (Round 5.3: D1 integration `/week-cycle` — onboard + 4 события онбординга);
- [x] Day 1 выполняет или не выполняет действие (Round 5.3: situation → start → outcome done, план first_try);
- [x] reload и restart сохраняют состояние (Round 5.3: повторные open — планы/сообщения стабильны, day=1);
- [x] Day 2 видит continuity (Round 5.3: `continuity.lastOutcome` указывает на план Day 1, return_D2 записан);
- [x] Day 3 получает grounded recap (Round 5.3: recap Day 3 цитирует «полезность 7/10» точно, recap_3d_viewed);
- [x] Days 4–6 проходят repeat/transfer/replacement (Round 5.3: Day 4 repeat_helpful, Day 5 transfer_helpful из конфликтного контекста, Day 6 replace_low_fit с новым планом);
- [x] Day 7 получает недельный recap и feedback (Round 5.3: recap_7d_viewed, feedback_submitted + строка pilot_feedback);
- [x] смена персонажа не теряет progress (Round 5.3: settings → skinny, 4 плана сохранены, trainer_changed, start/outcome после смены работают);
- [x] сценарий проходит при отключенном OpenAI (Round 5.3: в тестовом worker'е нет OPENAI_API_KEY — весь цикл на детерминированных fallback'ах, mechanism_generated не эмитится);
- [ ] mobile и desktop не имеют перекрытий и недоступных действий (нужен браузерный прогон UI; не автоматизируется на уровне D1 integration).

### Release checklist

- [x] миграции применяются на копии production schema (Round 5.4: `test:d1` — 9 таблиц на чистой локальной БД через wrangler migrations apply);
- [x] rollback проверен (Round 5.4: `test:d1` — повторное применение идемпотентно (table count не меняется), точечный DELETE чистый, schema не повреждена);
- [x] CSP/origin/body-size/rate-limit проверены (Round 5.4: CSP+X-Frame-Options+nosniff+Referrer-Policy через `next.config.ts` на всех ответах; origin+body-size на `/api/trainer` и `/api/skiller`; rate-limit = идемпотентность по request_id через `trainer_requests`);
- [x] логи не содержат чувствительный текст (Round 5.4: unit-тест — console.* никогда не интерполирует main_problem/confirmed_text/body.text/input.description/ключи; единственный лог `console.error("SKILLER API error", error)`);
- [ ] accessibility: keyboard, focus, labels, contrast (нужен браузерный прогон с axe/ручной проверкой; не автоматизируется на уровне unit/D1);
- [x] `lint`, `typecheck`, tests и `build` проходят (Round 5.4: 72 unit + D1 smoke + 14 integration сценариев + `vinext build` — все зелёные);
- [x] API key отсутствует в client bundle (Round 5.4: unit-тест на исходниках + grep-скан dist/client — `api.openai.com` и `OPENAI_API_KEY` отсутствуют);
- [ ] smoke test развернутой версии пройден (нужен реальный деплой на Cloudflare; локальный smoke через test:d1 и test:integration покрывает логику, но не живой edge).

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
