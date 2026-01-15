-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "ClassSubmission" (
    "id" TEXT NOT NULL,
    "submittedByName" TEXT NOT NULL,
    "submittedByEmail" TEXT NOT NULL,
    "classTitle" TEXT NOT NULL,
    "classUrl" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassSubmission_pkey" PRIMARY KEY ("id")
);
