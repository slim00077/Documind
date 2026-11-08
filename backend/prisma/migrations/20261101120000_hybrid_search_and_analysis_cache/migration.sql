-- Additive only: no existing table, column or row is modified.

-- Full-text index for hybrid search. The 'simple' config is language-neutral
-- (no stemming/stop-words), which suits mixed French/English documents and
-- exact identifiers. Queries must use the same expression to hit this index.
CREATE INDEX IF NOT EXISTS "DocumentChunk_content_fts_idx"
  ON "DocumentChunk" USING GIN (to_tsvector('simple', "content"));

-- Cache for on-demand AI analyses (summaries, extraction, Q&A, comparisons,
-- collection insights) so identical requests don't repeat LLM calls.
CREATE TABLE "DocumentAnalysis" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "cacheKey" TEXT NOT NULL,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentAnalysis_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DocumentAnalysis_userId_kind_cacheKey_key"
  ON "DocumentAnalysis"("userId", "kind", "cacheKey");
ALTER TABLE "DocumentAnalysis"
  ADD CONSTRAINT "DocumentAnalysis_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
