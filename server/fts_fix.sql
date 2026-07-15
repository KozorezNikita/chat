ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "searchVector" tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce(content, ''))) STORED;
CREATE INDEX IF NOT EXISTS "Message_searchVector_idx" ON "Message" USING GIN ("searchVector");
