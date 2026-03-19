-- AlterTable: Add token tracking to PipelineStage
ALTER TABLE "PipelineStage" ADD COLUMN "inputTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PipelineStage" ADD COLUMN "outputTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PipelineStage" ADD COLUMN "modelUsed" TEXT;
ALTER TABLE "PipelineStage" ADD COLUMN "backend" TEXT;
ALTER TABLE "PipelineStage" ADD COLUMN "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable: Add token tracking to PipelineMetric
ALTER TABLE "PipelineMetric" ADD COLUMN "totalInputTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PipelineMetric" ADD COLUMN "totalOutputTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PipelineMetric" ADD COLUMN "totalCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "PipelineMetric" ADD COLUMN "stageTokens" JSONB NOT NULL DEFAULT '{}';
