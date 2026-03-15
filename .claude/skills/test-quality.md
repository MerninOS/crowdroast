# Skill: Test Quality

## Purpose

This skill governs how Claude evaluates the quality of tests — not just
whether they pass, but whether they actually prove what they claim to prove.
A test suite that always passes is not the same as a test suite that catches
real bugs. This skill exists to tell the difference.

The key insight from the CasaPerks workflow: **the best way to prove a test
matters is to intentionally break the code it covers and confirm the test
fails.** If you can't break the code without breaking the test, the test is
working. If you can, the test is a false positive.

---

## When this skill is active

This skill is invoked when the developer runs `/review-tests`. Claude reads
this file before responding.

---

## Phase 1: Coverage audit

Claude reads the test files and the feature spec side by side.

For each acceptance criterion in the spec, Claude answers:
- Is there a test for the happy path? (yes / no / partial)
- Is there a test for the failure path? (yes / no / partial)
- Is the test verifying the right thing, or is it testing an implementation
  detail that could change without the feature breaking?

Claude produces a coverage table:

| Criterion | Happy path | Failure path | Notes |
|---|---|---|---|
| [criterion text] | ✓ / ✗ / ~ | ✓ / ✗ / ~ | [gap or concern] |

Where ✓ = covered, ✗ = missing, ~ = present but weak.

---

## Phase 2: False positive check (the break test)

For every test marked ✓ or ~, Claude proposes a specific mutation:
a small change to the production code that *should* break the feature
but *might not* break the test.

Format:

> **Test**: `[test name]`
> **Mutation**: Change `[specific line]` in `[file]` from `[X]` to `[Y]`
> **Expected**: Test should fail because `[reason]`
> **Risk**: If the test does NOT fail after this mutation, it is a false positive

Claude then instructs the developer to make each mutation, run the test, and
confirm the result. After each check:
- If the test fails as expected → ✓ confirmed real
- If the test passes (false positive detected) → flag for fix

The developer does not need to run every mutation. Claude prioritizes the top
3 highest-risk ones — typically: auth checks, data-modifying endpoints,
and error handling paths.

---

## Phase 3: Test quality rubric

Claude evaluates each test file against this rubric and notes any violations:

**Isolation** — Does this test depend on the state left by another test?
If tests must run in order to pass, they are coupled. Coupled tests produce
false failures when run in isolation and hide real bugs.

**Specificity** — Does the test assert what it claims to assert?
A test called `should reject invalid input` that only checks the status code
is not testing the error message, the error format, or the rejected field.
It is a weak test dressed up as a strong one.

**Realistic inputs** — Does the test use realistic data?
Tests using `id: 1` and `name: "test"` miss bugs that only appear with
real-world inputs (long strings, special characters, zero, negative numbers,
concurrent requests).

**Edge cases present** — Are the boring edge cases tested?
Empty arrays, zero values, maximum values, missing optional fields. These
are the inputs that break real apps in production.

**Test describes behavior, not implementation** — If you rename an internal
function, do the tests still make sense? Tests should describe what the
system does, not how it does it. Tests tied to internal function names break
during refactoring and give false failures.

---

## Phase 4: Summary and action items

Claude produces:

**Test suite grade** (A / B / C / D):
- A: All criteria covered, no false positives found, rubric clean
- B: Minor gaps, no false positives, small rubric issues
- C: Coverage gaps or false positives found, rubric violations present
- D: Significant coverage gaps and/or multiple false positives

**Action items** — a numbered list of specific things to fix, ordered by
severity. Each item includes:
- What to fix
- Which file and line
- Why it matters (what bug it would miss)

**What's solid** — explicitly call out what's working well. This is not
filler — developers need to know what not to change during the fix pass.

---

## What Claude never does during test review

- Never says "tests look good" without completing all four phases
- Never skips the break test because "the tests seem thorough"
- Never treats 100% line coverage as a proxy for test quality
- Never flags a test as a false positive based on reading alone — the
  mutation must actually be run
