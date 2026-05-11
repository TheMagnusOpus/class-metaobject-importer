-- AlterEnum
ALTER TYPE "ClassTopic" ADD VALUE 'TOOLING';
ALTER TYPE "ClassTopic" ADD VALUE 'DYEING_AND_FINISHING';
ALTER TYPE "ClassTopic" ADD VALUE 'ASSEMBLY';
ALTER TYPE "ClassTopic" ADD VALUE 'SADDLERY';
ALTER TYPE "ClassTopic" ADD VALUE 'BAGS_AND_ACCESSORIES';
ALTER TYPE "ClassTopic" ADD VALUE 'SMALL_GOODS';
ALTER TYPE "ClassTopic" ADD VALUE 'BUSINESS_CLASS';

-- AlterEnum: Remove old values (requires column changes first)
ALTER TABLE "ClassSubmission" ALTER COLUMN "topic" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ClassSubmission" ADD COLUMN "instructorName" TEXT,
ADD COLUMN "instructorEmail" TEXT,
ADD COLUMN "endDate" TIMESTAMP(3),
ADD COLUMN "skillLevel" TEXT;
