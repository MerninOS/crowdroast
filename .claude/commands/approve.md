Read `.claude/skills/approve-gate.md` in full before responding.

The developer is attempting to pass the current stage gate.

Check: have the three comprehension questions from the approve-gate skill
been answered in this conversation?

If YES — all three answered satisfactorily:
  Confirm the gate is passed. State:
  - Which stage just completed
  - Which stage comes next and what it will cover
  - Any concerns or open questions to carry into the next stage
  Then wait for the developer to run `/build` for the next stage.

If NO — questions not yet answered or answers were incomplete:
  Do not pass the gate. Restate the unanswered questions and explain
  why they matter for the next stage.

If the developer's answers revealed a misunderstanding:
  Name the misunderstanding clearly and specifically — not "that's not
  quite right" but "the auth guard runs before the validation pipe,
  which means if the token is invalid, your validation error message
  will never be returned — it'll always be a 401." Then ask the
  question again in a different way to confirm understanding.

Never pass the gate as a courtesy. The gate exists precisely because
it is uncomfortable to be asked to explain code you don't fully
understand yet. That discomfort is the mechanism.
