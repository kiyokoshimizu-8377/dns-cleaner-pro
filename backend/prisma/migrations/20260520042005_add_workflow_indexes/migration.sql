-- CreateIndex
CREATE INDEX "JobStep_taskId_idx" ON "JobStep"("taskId");

-- CreateIndex
CREATE INDEX "JobStep_taskId_status_idx" ON "JobStep"("taskId", "status");

-- CreateIndex
CREATE INDEX "JobTask_batchId_status_idx" ON "JobTask"("batchId", "status");

-- CreateIndex
CREATE INDEX "JobTask_updatedAt_idx" ON "JobTask"("updatedAt");
