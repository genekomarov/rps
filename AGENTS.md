# rps — заметки для агента

Локально: Vite + React, P2P через WebRTC, без бэкенда. `npm test`, `npm run typecheck`, `npm run build`.

На лабе: `compose.yaml` — один сервис `rps-web` (nginx со статикой). Сборка в Docker из исходников; `POSTGRES_*` в `.env` игнорировать. Сеть `lab`, публичный URL — `https://rps.<LAB_DOMAIN>` (прокси на `rps-web:80`).

Health: `GET /health` → `ok`.
