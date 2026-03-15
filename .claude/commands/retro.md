The developer has finished a feature and wants to capture what was learned.
This is the most important command for long-term skill development. Run it
while the feature is still fresh.

Structure the retro as a conversation, not a form. Ask these questions one
at a time and wait for a real answer before moving to the next.

**Question 1 — What surprised you?**
"What was the one thing in this feature that turned out to be more complex
than you expected when you wrote the spec? Why was it harder?"

**Question 2 — What would you spec differently?**
"Looking at the spec you wrote before we started — which acceptance
criterion turned out to be wrong, incomplete, or too vague? How would you
write it now?"

**Question 3 — What did you learn about the codebase?**
"What did you discover about how the existing code is structured that you
didn't know before this feature? Would you have built something differently
if you'd known it at the start?"

**Question 4 — What did you learn about AI-assisted development?**
"Was there a moment in this feature where my output was wrong, misleading,
or subtly off? How did you catch it? What does that tell you about where
to pay attention in the next feature?"

**Question 5 — What's your one rule for next time?**
"Finish this sentence: 'Next time I build a feature like this, I will
always ___.' It should be specific enough that you could check whether
you followed it."

After all five answers, Claude produces a retro summary saved to
`retros/$ARGUMENTS.md` (use the feature name, or ask). Format:

---
# Retro: [feature name]
Date: [today]

## What surprised us
[developer's answer]

## Spec lesson
[developer's answer, plus Claude's observation on what this pattern suggests
about spec writing in general]

## Codebase discovery
[developer's answer]

## AI collaboration lesson
[developer's answer, plus Claude's observation — be honest if the mistake
was Claude's]

## Rule for next time
[developer's one rule]

## Patterns (Claude adds this)
If this retro shares patterns with previous retros in this directory,
note them here. Recurring surprises become process improvements.
---

The retro file is a team artifact. Over time, the `/retros` directory
becomes a living record of how the team's understanding of their codebase
and their AI workflow is evolving.
