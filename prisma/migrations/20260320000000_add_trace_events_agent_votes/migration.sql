-- AlterTable
ALTER TABLE "PipelineRun" ADD COLUMN "traceId" TEXT;
CREATE UNIQUE INDEX "PipelineRun_traceId_key" ON "PipelineRun"("traceId");

-- CreateTable
CREATE TABLE "TraceEvent" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "spanId" TEXT NOT NULL,
    "parentSpanId" TEXT,
    "eventType" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "durationMs" INTEGER,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costUsd" DOUBLE PRECISION,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TraceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentVote" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "spanId" TEXT NOT NULL,
    "agentRole" TEXT NOT NULL,
    "votedOption" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reasoning" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TraceEvent_runId_timestamp_idx" ON "TraceEvent"("runId", "timestamp");
CREATE INDEX "TraceEvent_traceId_idx" ON "TraceEvent"("traceId");
CREATE INDEX "TraceEvent_spanId_idx" ON "TraceEvent"("spanId");

-- AddForeignKey
ALTER TABLE "TraceEvent" ADD CONSTRAINT "TraceEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PipelineRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentVote" ADD CONSTRAINT "AgentVote_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PipelineRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentVote" ADD CONSTRAINT "AgentVote_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "PipelineStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
