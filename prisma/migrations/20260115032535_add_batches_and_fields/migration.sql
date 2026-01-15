/*
  Warnings:

  - You are about to drop the `Session` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `cost` to the `ClassSubmission` table without a default value. This is not possible if the table is not empty.
  - Added the required column `format` to the `ClassSubmission` table without a default value. This is not possible if the table is not empty.
  - Added the required column `locationCity` to the `ClassSubmission` table without a default value. This is not possible if the table is not empty.
  - Added the required column `locationState` to the `ClassSubmission` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startDate` to the `ClassSubmission` table without a default value. This is not possible if the table is not empty.
  - Added the required column `topic` to the `ClassSubmission` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ClassFormat" AS ENUM ('IN_PERSON', 'ONLINE', 'HYBRID');

-- CreateEnum
CREATE TYPE "ClassTopic" AS ENUM ('BEGINNER', 'TOOLING', 'CARVING', 'DYEING', 'SADDLERY', 'WALLETS', 'BAGS', 'BELTS', 'FIGURE_CARVING', 'BUSINESSES', 'ASSEMBLY', 'COSTUMING');

-- AlterTable
ALTER TABLE "ClassSubmission" ADD COLUMN     "batchId" TEXT,
ADD COLUMN     "cost" TEXT NOT NULL,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "format" "ClassFormat" NOT NULL,
ADD COLUMN     "locationCity" TEXT NOT NULL,
ADD COLUMN     "locationState" TEXT NOT NULL,
ADD COLUMN     "startDate" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "topic" "ClassTopic" NOT NULL;

-- DropTable
DROP TABLE "Session";

-- CreateTable
CREATE TABLE "SubmissionBatch" (
    "id" TEXT NOT NULL,
    "submittedByName" TEXT NOT NULL,
    "submittedByEmail" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubmissionBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClassSubmission_status_idx" ON "ClassSubmission"("status");

-- CreateIndex
CREATE INDEX "ClassSubmission_batchId_idx" ON "ClassSubmission"("batchId");

-- AddForeignKey
ALTER TABLE "ClassSubmission" ADD CONSTRAINT "ClassSubmission_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "SubmissionBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
