# Skill: Approve Gate

## Purpose

This skill governs what happens at the end of every build stage. The gate is
not a formality — it is the primary mechanism for keeping the developer in
comprehension of the codebase as it grows. Claude pauses here and does not
continue until the gate is passed.

The gate has two parts: Claude's stage report, and the developer's
comprehension check. Both are required.

---

## When this skill is active

This skill is invoked automatically at the end of every `/build` stage.
Claude reads this file and follows the protocol below before stopping.

It is also invoked when the developer runs `/approve`.

---

## Stage report (Claude produces this automatically)

At the end of each stage, Claude produces a structured report before halting.

### Files changed
An exact list of every file created or modified. For each file:
- File path
- One sentence on what it does and why it exists
- Any coupling to other files (what breaks if this file is removed?)

### How to run
Step-by-step commands to start the app and exercise what was just built.
Not "run the app and test it" — specific commands, specific URLs, specific
interactions to perform.

### What to test manually
A checklist of manual tests derived from the feature spec. Format:
- [ ] Action → expected result
- [ ] Action → expected result

### What was not done
An honest list of things deferred to a later stage, with a brief reason.
This prevents the developer from assuming the current stage is more complete
than it is.

### Tradeoffs made
For every significant implementation decision in this stage:
- What was chosen and why
- What the main alternative was and why it wasn't chosen
- What the downside of the chosen approach is

This section is not optional. If Claude made no meaningful decisions, it
should say "No significant tradeoffs in this stage." But that is rare.

---

## Comprehension check (developer must pass this)

After the stage report, Claude asks the developer exactly three questions
before accepting `/approve`:

**Question 1 — Structural**: "Walk me through what happens when [key
interaction from this stage]. Start from the user action and trace it to
the data layer."

**Question 2 — Failure mode**: "What happens in the code if [a realistic
failure condition for this stage]? Where would you look to debug it?"

**Question 3 — Change impact**: "If we needed to change [a specific thing
Claude just built], what other files would you need to touch and why?"

Claude listens to the developer's answers. If the answers are vague,
incomplete, or incorrect, Claude does not accept the gate. It explains what
was misunderstood and asks the question again differently.

If the developer runs `/approve` without answering the comprehension
questions, Claude responds:

> "Before I continue, I need you to answer the three comprehension questions
> above. This isn't a formality — if you can't answer these, we'll hit
> problems in the next stage that will be harder to debug."

---

## Gate outcomes

**Pass** → Claude begins the next stage. It opens with a one-sentence
reminder of what the next stage will do and which spec acceptance criteria
it covers.

**Redirect** → Developer says what should change. Claude adjusts scope,
approach, or implementation before continuing. Redirects do not require
re-running comprehension questions if the change is small. Large redirects
(architecture changes) require re-running all three questions.

**Pause** → Developer needs time to review. Claude summarizes where things
stand and what the next step will be, so context can be resumed later.

---

## Stage definitions (default, adjust per project)

| Stage | Scope |
|---|---|
| 1 — Scaffold | Project structure, dependencies, config, CI skeleton |
| 2 — Backend | API endpoints, data layer, auth, validation, security |
| 3 — Frontend | UI components, API integration, error handling, UX |
| 4 — Polish | Tests, docs, edge cases, performance, accessibility |

Stages may be split further for large features. Claude proposes splits at
spec time if a feature seems too large for four stages.

---

## What Claude never does at a gate

- Never says "looks good, moving on" without the comprehension check
- Never skips the tradeoffs section ("no decisions were made" is almost
  never true)
- Never marks a stage complete if tests for that stage are missing and no
  explicit deferral reason was given
- Never continues if the developer's answers reveal a fundamental
  misunderstanding of the architecture
