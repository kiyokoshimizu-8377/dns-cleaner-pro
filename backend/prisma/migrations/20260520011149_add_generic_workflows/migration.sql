-- CreateEnum
CREATE TYPE "BatchType" AS ENUM ('MASS_CLEAN', 'DEEP_SYNC', 'AUTO_ONBOARDING');

-- CreateEnum
CREATE TYPE "Status" AS ENUM ('PENDING', 'RUNNING', 'CANCELLING', 'CANCELLED', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "JobBatch" (
    "id" TEXT NOT NULL,
    "type" "BatchType" NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'PENDING',
    "totalJobs" INTEGER NOT NULL DEFAULT 0,
    "completedJobs" INTEGER NOT NULL DEFAULT 0,
    "failedJobs" INTEGER NOT NULL DEFAULT 0,
    "cancelReason" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "JobBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobTask" (
    "id" TEXT NOT NULL,
    "bullJobId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "targetId" TEXT,
    "status" "Status" NOT NULL DEFAULT 'PENDING',
    "currentStep" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobStep" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "JobStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobTask_bullJobId_key" ON "JobTask"("bullJobId");

-- CreateIndex
CREATE INDEX "JobTask_bullJobId_idx" ON "JobTask"("bullJobId");

-- CreateIndex
CREATE INDEX "JobTask_batchId_idx" ON "JobTask"("batchId");

-- AddForeignKey
ALTER TABLE "JobTask" ADD CONSTRAINT "JobTask_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "JobBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobStep" ADD CONSTRAINT "JobStep_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "JobTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
