-- Migration: allow_code_reuse_on_soft_delete
--
-- Problem: the global UNIQUE constraint on archives.code blocks reuse of a
-- code once an archive is soft-deleted (deleted_at IS NOT NULL).
--
-- Fix: replace the global unique constraint and non-partial index with
-- partial equivalents that only enforce uniqueness among active rows
-- (deleted_at IS NULL).  Soft-deleted rows are excluded from both indexes,
-- so their codes can be reused by new active archives.

-- Step 1: drop the global unique index (was created with CREATE UNIQUE INDEX, not ALTER TABLE)
DROP INDEX IF EXISTS "archives_code_key";

-- Step 2: drop the non-partial performance index on code
DROP INDEX IF EXISTS "archives_code_idx";

-- Step 3: partial unique index — uniqueness enforced only for active archives
CREATE UNIQUE INDEX "archives_code_unique_active"
    ON "archives"("code")
    WHERE "deleted_at" IS NULL;

-- Step 4: partial index for query performance when filtering active archives by code
CREATE INDEX "archives_code_idx"
    ON "archives"("code")
    WHERE "deleted_at" IS NULL;
