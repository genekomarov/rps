# rps

Локальные P2P-игры (WebRTC) без серверного бэкенда.

## Скрипты

| Команда | Описание |
| --- | --- |
| `npm run dev` | Запускает dev-сервер Vite с горячей перезагрузкой |
| `npm run build` | Собирает production-версию приложения |
| `npm run preview` | Локально показывает собранную production-сборку |
| `npm run test` | Запускает тесты Vitest один раз |
| `npm run test:watch` | Запускает тесты Vitest в режиме наблюдения |
| `npm run typecheck` | Проверяет типы TypeScript без генерации файлов |

## Лаб (хаб)

`compose.yaml` поднимает `rps-web` (nginx) в сети `lab`. Postgres не используется.
