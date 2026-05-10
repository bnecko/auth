# Code Style

## Comments

Write a comment only when the WHY is non-obvious: a hidden constraint,
a subtle invariant, a workaround for a specific bug, behavior that would
surprise a reader. If removing the comment would not confuse a future
reader, omit it.

Never narrate what the code does. Well-named identifiers already do that.
Never reference the current task, fix, or caller.

One short line per comment. No multi-line blocks unless the WHY genuinely
requires more than one sentence.

Rules:
- No em dashes (the unicode character U+2014, rendered as --). Use a colon,
  comma, or rewrite the sentence instead.
- No ALL CAPS words.
- No exclamation marks.
