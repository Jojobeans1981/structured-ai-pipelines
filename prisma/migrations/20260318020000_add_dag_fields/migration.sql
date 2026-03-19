-- AlterTable: Add DAG fields to PipelineRun
ALTER TABLE "PipelineRun" ADD COLUMN "executionPlan" JSONB,
ADD COLUMN "planApproved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "outputPath" TEXT,
ADD COLUMN "executionMode" TEXT NOT NULL DEFAULT 'linear';

-- AlterTable: Add DAG fields to PipelineStage
ALTER TABLE "PipelineStage" ADD COLUMN "dependsOn" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "nodeType" TEXT NOT NULL DEFAULT 'skill',
ADD COLUMN "parallelGroup" TEXT,
ADD COLUMN "gateType" TEXT,
ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "maxRetries" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN "outputDir" TEXT,
ADD COLUMN "phaseIndex" INTEGER,
ADD COLUMN "nodeId" TEXT;
