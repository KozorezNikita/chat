# Chat App

Real-time чат-додаток з приватними і груповими розмовами, typing indicators, presence, read receipts, threading, реакціями, файлами і пошуком.

## Стек

**Backend:** Node.js · Express 5 · TypeScript · PostgreSQL + Prisma · Socket.io · Redis · Zod · Pino · Jest

**Frontend:** Next.js 16 · React 19 · TanStack Query · shadcn/ui (Tailwind v4) · Sonner · Socket.io-client · Axios

**Інфраструктура:** Docker Compose (Postgres, Redis, Mailpit, MinIO)

## Структура

```
.
├── server/              # Express + Socket.io API
├── client/              # Next.js фронтенд
├── shared/              # Спільні Zod-схеми DTO та типи Socket.io подій
├── docker-compose.yml   # Postgres + Redis + Mailpit + MinIO для dev
└── docker-compose.test.yml  # Окремий Postgres для integration-тестів
```

## Швидкий старт

```bash
# 1. Клонуй і налаштуй env
cp .env.example .env
cp server/.env.example server/.env
cp client/.env.example client/.env.local

# 2. Підніми інфраструктуру
docker compose up -d

# 3. Backend
cd server && npm install && npx prisma migrate dev && npm run dev

# 4. Frontend (новий термінал)
cd client && npm install && npm run dev
```

Локальні URL після старту:

- Frontend: http://localhost:3000
- API: http://localhost:5000/api/v1
- Mailpit (перегляд листів): http://localhost:8025
- MinIO console: http://localhost:9001

## Документація

Детальніше — у README кожного підпроекту:

- [server/README.md](./server/README.md)
- [client/README.md](./client/README.md)
