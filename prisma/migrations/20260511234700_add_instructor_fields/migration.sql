-- AlterTable: Add new columns to ClassSubmission
ALTER TABLE "ClassSubmission" ADD COLUMN IF NOT EXISTS "instructorName" TEXT;
ALTER TABLE "ClassSubmission" ADD COLUMN IF NOT EXISTS "instructorEmail" TEXT;
ALTER TABLE "ClassSubmission" ADD COLUMN IF NOT EXISTS "endDate" TIMESTAMP(3);
ALTER TABLE "ClassSubmission" ADD COLUMN IF NOT EXISTS "skillLevel" TEXT;

-- Make topic optional
ALTER TABLE "ClassSubmission" ALTER COLUMN "topic" DROP NOT NULL;
