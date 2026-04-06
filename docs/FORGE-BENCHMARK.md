# Forge Benchmark

This is the first repeatable benchmark harness for Forge.

## Goal

Give Forge a fixed set of benchmark cases so changes can be evaluated consistently over time.

## Current Scope

The first version is intentionally offline and deterministic.

It benchmarks core system behavior that should stay stable even before we wire in live end-to-end runs:
- artifact recovery
- manifest correctness
- launch script normalization
- preview-readiness gating
- artifact/tooling health

## Why Start Here

This makes the benchmark:
- fast
- repeatable
- cheap to run
- stable in CI

It also gives us a baseline before we add more expensive end-to-end cases involving live agent calls, repo cloning, and preview workers.

## Benchmark Entry Point

Run:

```bash
npm run benchmark:forge
```

Current implementation:
- benchmark logic: [benchmark.ts](/c:/Users/beame/Desktop/structured-ai-pipelines/src/services/forge/benchmark.ts)
- benchmark test harness: [forge-benchmark.test.ts](/c:/Users/beame/Desktop/structured-ai-pipelines/tests/forge-benchmark.test.ts)

## Current Cases

1. Incomplete React output can be recovered into a previewable scaffold
2. Broken Node server scripts are normalized away from stale `nodemon src/index.js`
3. Manifest dependencies are normalized and topologically ordered
4. Preview readiness blocks false-positive launch claims
5. Recovered artifacts still support dependencies, tests, Docker generation, and secret cleanliness

## What Comes Next

Once this baseline is useful, we can add:
- live Forge build cases
- repo-backed benchmark fixtures
- runtime preview boot scoring
- regression history over time
- benchmark result snapshots for mentor/demo review
