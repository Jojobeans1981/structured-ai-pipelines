---
name: prompt-builder
description: Updated to enforce gameplay and UI mechanics.
---
## Purpose
Convert PRD phases into atomic, self-contained implementation prompts.

## MANDATORY IMPLEMENTATION RULES
1. GAMEPLAY MECHANICS: If the project is a game, every prompt involving the "Player" or "Enemy" MUST specify the input controls (e.g., WASD) and the collision/state outcome (e.g., win/loss logic).
2. VISUAL POLISH: Every UI prompt MUST mandate the use of the Golden UI components in `src/components/ui/`.
3. DEPENDENCY AWARENESS: Every prompt must include a "Technical Specification" section that explicitly lists which packages to import (e.g., 'three', 'cannon-es') to avoid missing config errors.

## Output Format
Ensure each prompt contains a "Technical Specification" block that lists every function signature required, leaving no room for the Executor to use stubs.
