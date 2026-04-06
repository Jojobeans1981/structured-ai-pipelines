# Forge Step Contracts

This document turns Forge's implicit pipeline expectations into testable contracts before a larger graph refactor.

## Goal

Define each Forge step with:
- a clear purpose
- a machine-checkable output shape
- explicit success criteria
- explicit blocking criteria

The working source of truth lives in [src/services/forge/types/contracts.ts](/c:/Users/beame/Desktop/structured-ai-pipelines/src/services/forge/types/contracts.ts).

## Covered Steps

1. Analyze Repo
2. Generate PRD
3. Generate Manifest
4. Validate Output
5. Launch Readiness
6. Preview Readiness
7. Repair Planning

## Why This Exists

Forge currently mixes:
- LLM reasoning
- deterministic checks
- best-effort recovery loops

Without strict contracts, the system can produce inconsistent outputs because adjacent steps are making different assumptions about what "good" means.

These contracts let us test the policy before we commit to a broader architecture change.

## What We Can Test Now

- schema validity for step outputs
- manifest dependency integrity
- launch/preview decisions requiring blockers when not ready
- validation payload consistency
- repair plan structure

## What This Does Not Yet Do

- enforce every contract at runtime across all agents
- replace all prompt-level instructions with deterministic checks
- convert Forge into a full graph engine

## Next Step If This Works

Promote these contracts from test harnesses into runtime gates:
- parse every Forge agent output through a schema
- fail closed on contract violations
- branch repair loops by contract failure type
- make preview-readiness the primary completion gate for previewable projects
