# SKILLER Frozen MVP Audit

Дата: 2026-09-12  
Источник требований: `SKILLER — FROZEN MVP SPEC v1.0 — 12.09.2026`

## Итог

Локальная версия существенно опережает GitHub `main` (`dafd659fcbbeea828fa3d1c57de358b7d8883e43`): добавлены недельный AI-тренер, три персонажа, режимы входа, память, события, safety flow, Free Talk, Day 3/7 recap, journal и расширенный разбор ситуации.

Frozen scope запрещает до завершения теста полноценный кабинет терапевта, marketplace, realtime voice, сложную геймификацию и расширение всей базы навыков. Следующая работа должна закрывать измерение, continuity, pilot analytics и тестирование существующего цикла.

## Definition of Done

| Пункт | Статус | Что подтверждено / чего не хватает |
|---|---|---|
| A. Онбординг и 3 персонажа | Реализовано | Марша, Бек и Скинни выбираются и сохраняются. |
| B. Character Bible | Частично | Конфиги, реплики и ограничения версионированы; отдельных полных Bible и сценарных тестов нет. |
| C. Ситуация → микро-действие | Реализовано | Safety gate, детерминированный Skill Engine и 8 allowlisted навыков. |
| D. Outcome влияет на предложения | Частично | Outcome сохраняется; completion отделен от helpfulness. Следующий подбор пока почти не использует evidence. |
| E. Day 2 помнит Day 1 | Частично | Последний outcome отображается, но отдельного Day 2 continuity flow нет. |
| F. Grounded Day 3 recap | Реализовано | Recap строится из сохраненных попыток без выдуманных причин. |
| G. Days 4–7 repeat/transfer/replacement | Частично | Resize и replace есть; системного повторения полезного навыка и transfer нет. |
| H. Day 7 recap | Реализовано | Недельный recap строится по реальным попыткам и engaged days. |
| I. Free Talk | Реализовано | Ограниченный ответ, один вопрос, управляемые переходы и fallback. |
| J. Safety отдельно от персонажа | Реализовано | Риск проверяется до AI и блокирует обычную практику. |
| K. Смена режима/персонажа | Реализовано | Настройки меняются без удаления progress/memory. |
| L. Backend events | Реализовано | Ключевые onboarding, return, action, recap и distress events сохраняются. |
| M. Google Sheets mirror | Не реализовано | Нет экспорта, retry и контроля минимизации данных. |
| N. Ручной расчет метрик | Частично | События есть; нет cohort attribution и готового отчета. |
| O. Quality gates | Реализовано | `build`, `tsc`, `lint`, Python unit tests проходят. |
| P. E2E Day 1→7 | Не реализовано | Нет reload/restart/fallback E2E сценария. |
| Q. Тест на 5 людях | Внешний этап | Нет результатов moderated pilot. |
| R. Когорта 20–30 | Внешний этап | Запускается после технического DoD и исправления blockers. |

## Исправлено в этом проходе

- выполнение действия теперь хранится независимо от оценки полезности;
- неудачная попытка сохраняется как attempt и не увеличивает completions;
- failed attempt не создает delayed check-in;
- средние outcome-метрики считаются по попыткам, как в доменном Python-ядре;
- добавлена миграция `outcomes.completed` с совместимостью старых данных;
- исправлен блокирующий production build JSX в `PlanCard`;
- устранены строгие TypeScript и ESLint ошибки.

## Следующий приоритет

1. Outcome-aware повторение: полезный навык повторять в совместимой ситуации, неудачный заменять.
2. Integration tests для trainer API: done/failed, safety, duplicate request, смена персонажа.
3. Неблокирующий Google Sheets mirror с retry и cohort id.
4. E2E Day 1→7 с reload/restart и deterministic fallback.
5. Character Bible и сценарные проверки трех персонажей.

## Проверки

- `npm run build` — успешно;
- `npx tsc --noEmit` — успешно;
- `npm run lint` — успешно;
- `PYTHONPATH=src python -m unittest discover -s tests -p "test_*.py"` — 4/4 успешно.
