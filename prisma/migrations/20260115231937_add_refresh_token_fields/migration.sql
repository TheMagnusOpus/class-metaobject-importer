/*
  Warnings:

  - Made the column `collaborator` on table `Session` required. This step will fail if there are existing NULL values in that column.
  - Made the column `emailVerified` on table `Session` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "refreshToken" TEXT,
ADD COLUMN     "refreshTokenExpires" TIMESTAMP(3),
ALTER COLUMN "collaborator" SET NOT NULL,
ALTER COLUMN "emailVerified" SET NOT NULL;
