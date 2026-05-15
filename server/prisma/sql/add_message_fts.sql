-- ============================================
-- Iter 8: Full-text search index on Message.content
-- ============================================
--
-- Generated column "searchVector" tsvector - автоматично оновлюється
-- при INSERT/UPDATE Message.content. Prisma не підтримує generated columns
-- у schema.prisma, тому залишаємо це поле невидимим для Prisma — використовуємо
-- лише через $queryRaw у search.repo.ts.
--
-- Чому 'simple' config (не 'english'/'russian'/'ukrainian'):
--  - Postgres не має ukrainian dictionary за замовчуванням
--  - 'simple' просто tokenize + lowercase, без stemming
--  - Користувач шукає "привіт" → matchується "привіт" літерально
--
-- GIN index — швидкі пошуки через @@ operator.
--
-- Цей файл — manual migration. Apply через:
--   psql $DATABASE_URL -f prisma/sql/add_message_fts.sql
-- або через Prisma migrate (див. README/MIGRATION_NOTES).

ALTER TABLE "Message"
  ADD COLUMN IF NOT EXISTS "searchVector" tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce(content, ''))) STORED;

CREATE INDEX IF NOT EXISTS "Message_searchVector_idx"
  ON "Message" USING GIN ("searchVector");
