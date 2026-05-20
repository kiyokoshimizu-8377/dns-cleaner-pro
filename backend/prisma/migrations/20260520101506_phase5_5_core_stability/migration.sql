-- CreateEnum
CREATE TYPE "AccountHealth" AS ENUM ('HEALTHY', 'RATE_LIMITED', 'INVALID_CREDENTIALS', 'DISABLED');

-- CreateEnum
CREATE TYPE "CircuitState" AS ENUM ('CLOSED', 'OPEN', 'HALF_OPEN');

-- AlterEnum
ALTER TYPE "Status" ADD VALUE 'DLQ';

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "health" "AccountHealth" NOT NULL DEFAULT 'HEALTHY';

-- AlterTable
ALTER TABLE "JobStep" ADD COLUMN     "externalRequestId" TEXT,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "resultData" JSONB;

-- CreateTable
CREATE TABLE "StepSnapshot" (
    "id" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StepSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderState" (
    "provider" TEXT NOT NULL,
    "state" "CircuitState" NOT NULL DEFAULT 'CLOSED',
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "cooldownMs" INTEGER NOT NULL DEFAULT 300000,
    "lastFailure" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderState_pkey" PRIMARY KEY ("provider")
);

-- CreateIndex
CREATE INDEX "StepSnapshot_stepId_idx" ON "StepSnapshot"("stepId");

-- AddForeignKey
ALTER TABLE "StepSnapshot" ADD CONSTRAINT "StepSnapshot_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "JobStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;
