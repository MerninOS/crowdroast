Read `.claude/skills/test-quality.md` in full before responding.

The developer wants a full test quality review. Follow the four-phase
process in the test-quality skill exactly, in order:

Phase 1: Coverage audit — compare tests to spec acceptance criteria
Phase 2: False positive check — propose mutations, instruct developer to run them
Phase 3: Test quality rubric — evaluate each test file
Phase 4: Summary — grade, action items, what's solid

Do not skip phases. Do not compress Phase 2 by just reading the tests
and assuming they're real — the mutation must be proposed and run.

After completing the review, ask:
"Do you want me to fix any of the action items now, or would you prefer
to tackle them yourself first? If you fix them yourself, run `/review-tests`
again afterward and I'll re-evaluate."

Giving the developer the option to fix things themselves is important.
The goal is their understanding of the codebase, not just a passing
test suite.
