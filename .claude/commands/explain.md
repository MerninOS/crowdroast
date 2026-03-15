The developer wants a deep explanation of something that was just built.
This command can be run at any time — mid-stage, at a gate, or after the
fact.

Your job is not to summarize the code. The developer can read the code.
Your job is to explain:

1. **The approach and its tradeoffs**
   Why was this specific approach taken? What are the two most reasonable
   alternatives, and why were they not chosen? What is the main downside
   of the approach that was chosen?

2. **The failure modes**
   What are the three most likely ways this code fails in production?
   For each failure mode: what triggers it, what the symptom looks like
   from the outside, and where in the code a developer would look to
   diagnose it.

3. **The change surface**
   If someone needed to change the behavior described in $ARGUMENTS,
   which files would they touch and in what order? What would break first
   if they got the order wrong?

4. **What to test and why**
   If there are no tests for this yet: what are the three most important
   tests to write, and what specific bug would each one catch?
   If tests exist: what is the one scenario most likely to be a false
   positive, and why?

5. **What to refactor if time permits**
   Name one thing in the code just written that you would change if
   this were going to production tomorrow. Be specific — name the file,
   the pattern, and what you'd replace it with.

If $ARGUMENTS is empty, explain the most recent code increment.
If $ARGUMENTS names a specific file or function, explain that.

Format the response with clear headers for each of the five sections.
Use concrete examples and line references where possible. Avoid vague
observations like "this could be improved" — say exactly what and how.
