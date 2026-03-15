# Skill: Feature Spec

## Purpose

This skill governs how Claude helps a developer write a feature spec before
any code is written. The spec is not bureaucracy — it is the mechanism by
which the developer proves to themselves (and to Claude) that they understand
what they're building before delegating implementation to AI.

A developer who cannot write a spec cannot evaluate whether Claude's output
is correct. The spec is the developer's intellectual stake in the feature.

---

## When this skill is active

This skill is invoked when the developer runs `/spec`. Claude reads this file
before responding.

---

## What Claude must produce

Claude will guide the developer through producing a spec document with these
sections. Claude does NOT write the spec for the developer — it asks questions
and reflects answers back until each section is solid.

### 1. Feature summary (developer writes this)
One paragraph. What is this feature? Who uses it? What problem does it solve?
Claude's job: ask "why does this feature exist?" until the answer is concrete
and not generic.

### 2. Acceptance criteria (developer writes these)
A numbered list of concrete, testable statements. Format: "Given X, when Y,
then Z." Not vague goals — specific observable outcomes.

Claude's job: push back on any criterion that can't be tested. "The UI looks
good" is not a criterion. "The modal closes within 300ms of clicking confirm"
is a criterion.

### 3. Explicit non-goals
What is this feature intentionally NOT doing? This prevents scope creep and
helps the developer communicate constraints to the AI implementer.

Claude's job: prompt for at least two non-goals. Developers almost always
forget this section.

### 4. Test spec (developer writes this with Claude's help)
For each acceptance criterion, define:
  - Happy path test: what does success look like in a test?
  - Failure path test: what does failure look like? What should the system do?
  - "How to break this test" check: describe one way to make this test a
    false positive. Confirm you can't do that accidentally.

Claude's job: for every happy path, ask "what's the failure case?" until both
are documented.

### 5. Architecture sketch (developer writes this)
Before implementation: what files will change? What new files will be created?
What data flows through this feature? Draw it in words or pseudocode.

Claude's job: ask "where does this data come from and where does it go?" If
the developer can't answer, they don't understand the feature yet. Do not
proceed to /build until this is answered.

### 6. Open questions
What does the developer not know yet? What assumptions are they making?

Claude's job: surface assumptions the developer hasn't made explicit. Common
ones: "I'm assuming the API already exists," "I'm assuming auth is handled
upstream."

---

## Output format

When the spec is complete, Claude produces a markdown document in this
structure and saves it as `specs/<feature-name>.md`. Claude then says:

> "Spec complete. Run `/build` to begin implementation, stage by stage.
> Before we start: can you describe in your own words what happens when
> [most complex acceptance criterion]? I want to make sure the spec
> reflects your mental model before we write any code."

This final comprehension check is mandatory. Claude does not skip it.

---

## Red flags (Claude watches for these)

- Developer can't describe failure cases → spec is not ready
- Acceptance criteria use the word "should" instead of "will" → too vague
- No non-goals → scope will creep
- Architecture sketch is missing → developer is guessing at implementation
- No open questions → developer is overconfident

If any red flag is present, Claude surfaces it explicitly before moving on.
