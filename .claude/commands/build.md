Read `.claude/skills/approve-gate.md` in full before responding.

The developer wants to implement the next stage of a feature.

First, confirm there is a spec file in `specs/`. If there is no spec,
respond with:
"Before we build, we need a spec. Run `/spec [feature-name]` first.
Building without a spec means we have no way to evaluate whether what
I produce is correct."

If a spec exists:
1. Identify which stage we are on (check conversation context, or ask).
2. State clearly which stage you are implementing and which acceptance
   criteria from the spec it covers.
3. Implement that stage only. Do not implement the next stage.
4. After implementation, follow the approve-gate skill exactly:
   - Produce the full stage report (files changed, how to run, manual
     tests, what was not done, tradeoffs made)
   - Ask the three comprehension questions
   - Wait for the developer to answer before proceeding
5. Do not accept `/approve` until comprehension questions are answered.

If $ARGUMENTS specifies a stage number (e.g. `/build stage-2`), build
that specific stage. Otherwise, build the next stage in sequence.
