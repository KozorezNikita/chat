-- ============================================
-- Manual migration: Full-Text Search для Message
-- ============================================
--
-- Чому окремо від Prisma migrate:
-- Prisma 6+ страждає від drift на GENERATED ALWAYS колонках
-- (див. https://github.com/prisma/prisma/issues/24496) —
-- кожен наступний `migrate dev` намагається DROP/ADD цю колонку
-- та її GIN-індекс. Щоб уникнути цього, тримаємо tsvector
-- повністю поза Prisma-схемою.
--
-- Як застосувати:
--   У dev (Linux/Mac):
--     psql $DATABASE_URL -f prisma/sql/add_message_fts.sql
--   У dev (Windows + Docker):
--     docker exec -i <postgres-container> psql -U chatapp -d chat < prisma/sql/add_message_fts.sql
--   У prod:
--     запускається з deploy-скрипта одразу після `prisma migrate deploy`
--
-- Як запитувати з коду:
--   Через prisma.$queryRaw, з плейсхолдерами і to_tsquery('simple', ...).
--   САМЕ ПОЛЕ searchVector НЕ ВКЛЮЧАЄМО у SELECT-список —
--   $queryRaw не вміє десеріалізувати tsvector.

-- Generated колонка: автоматично перераховується при INSERT/UPDATE.
-- Конфіг 'simple' — без stemming, бо чат багатомовний.
-- coalesce — щоб NULL у content (якщо колись з'явиться) не зламав generation.
ALTER TABLE "Message"
  ADD COLUMN IF NOT EXISTS "searchVector" tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce("content", ''))) STORED;

-- GIN-індекс — обов'язковий, інакше пошук == повний скан таблиці.
CREATE INDEX IF NOT EXISTS "Message_searchVector_idx"
  ON "Message" USING GIN ("searchVector");
