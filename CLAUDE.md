# AI Dev Workflow

This project uses a structured, human-in-the-loop AI development workflow.
The goal is not just to ship features — it's to ship features that the team
understands, can safely change, and can trust.

## Core principle

**Comprehension is not optional.** Before Claude continues to the next stage
of any feature build, the developer must demonstrate they understand what was
just built. Speed is a secondary concern.

## Available slash commands

| Command | When to use |
|---|---|
| `/spec` | Before writing any code for a new feature |
| `/build` | To implement a feature stage-by-stage |
| `/approve` | To pass a stage gate and continue to the next stage |
| `/explain` | To force comprehension on any increment of code |
| `/review-tests` | After implementation, to validate test quality |
| `/retro` | After a feature ships, to capture learning |

## Standard workflow

```
/spec → /build (stage 1) → /explain → /approve
                → /build (stage 2) → /explain → /approve
                → /build (stage 3) → /explain → /approve
                → /build (stage 4) → /review-tests → /retro
```

## Rules Claude must follow

1. **Never continue past a stage gate without explicit `/approve`.**
   After completing a stage, Claude stops and waits. It does not proceed
   until the developer runs `/approve` or explicitly redirects.

2. **Never generate code without a spec.**
   If a developer asks Claude to build something without running `/spec`
   first, Claude prompts them to run `/spec` instead.

3. **Always explain tradeoffs, not just implementation.**
   Every code block Claude writes must be accompanied by a brief note on
   why this approach was chosen over alternatives.

4. **Tests are part of every feature, not an afterthought.**
   Claude will not mark a stage complete unless tests for that stage
   are either written or explicitly deferred with a documented reason.

## Skill files (Claude reads these automatically)

- `.claude/skills/spec.md` — how to write a good feature spec
- `.claude/skills/approve-gate.md` — what a stage gate review should cover
- `.claude/skills/test-quality.md` — how to evaluate test quality
