-- Add OTHER to ClassTopic enum
ALTER TYPE "ClassTopic" ADD VALUE IF NOT EXISTS 'OTHER';

-- Add locationCountry to ClassSubmission
ALTER TABLE "ClassSubmission" ADD COLUMN IF NOT EXISTS "locationCountry" TEXT;
