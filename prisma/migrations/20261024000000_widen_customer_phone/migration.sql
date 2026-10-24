-- AlterTable
-- A trip can now record up to five phone numbers, stored as normalised
-- 10-digit numbers joined by commas. Existing single-number rows stay valid
-- as they are, so no data rewrite is needed.
ALTER TABLE "trip" ALTER COLUMN "customerPhone" TYPE VARCHAR(200);
