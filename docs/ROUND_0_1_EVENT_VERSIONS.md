# SKILLER — Round 0.1 Event Versions

Дата: 2026-09-15  
Issue: #35  
Деплой: не входит в раунд.

## Цель

Каждое новое обязательное событие пилота должно сохранять воспроизводимый
version envelope:

- `product_version` — версия продукта;
- `character_version` — версия поведения персонажа;
- `skill_card_version` — версия фактически использованной карточки навыка либо
  `null`, если событие не относится к навыку.

## Что было до раунда

- `product_version` существовала в отдельной колонке `pilot_events`, но не была
  частью каждого payload;
- `character_version` записывалась только в onboarding;
- версия навыка была локальным литералом только в `skill_recommended`;
- события старта, результата, оценки, resize и replacement не сохраняли версию
  карточки;
- настройки тренера записывали события отдельным SQL-путём.

## Реализация

1. `lib/pilot-events.ts` — единственный production writer для `pilot_events`.
   Он добавляет авторитетные версии после доменного payload, поэтому вызывающий
   код не может подменить envelope.
2. `lib/skill-card-versions.ts` — явный fail-closed реестр версий восьми Frozen
   skill cards. Неизвестная карточка не может быть сохранена без версии.
3. События skill lifecycle передают реальный `skill_id`; writer получает версию
   из реестра. Для событий без навыка записывается `skill_card_version: null`.
4. Запись событий изменения тренера и interaction mode переведена на общий
   writer без потери атомарного D1 batch.
5. `SkillView.version` сохраняется вместе со snapshot карточки в новых планах.

## Проверяемые инварианты

- payload каждого нового pilot event содержит все три version-поля;
- верхнеуровневая колонка `product_version` совпадает с envelope;
- в `lib/` существует ровно одно production SQL-выражение записи
  `pilot_events`;
- каждая Frozen skill card имеет зарегистрированную версию;
- D1 integration проверяет skill и non-skill события.

## Не входит

- формализация полной event schema и аудит перечня событий;
- cohorts и аналитические вычисления;
- export queue и Google Sheets mirror;
- browser E2E;
- деплой.

## Следующий малый раунд

Round 0.2 — единый документ обязательных environment variables и Cloudflare
bindings без публикации секретов.
