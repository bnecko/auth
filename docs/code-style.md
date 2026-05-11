# Code Style

## The goal

Code is read far more than it is written. Optimize for the person reading this in six months — which may be you, a teammate, or an AI working on a future task. The measure of good code is not cleverness, it is how quickly a reader can understand and safely modify it.

## Structure over size

Split code by responsibility, not by length. A 30-line file that does one thing is better than a 300-line file that does three. A 300-line file that is genuinely one cohesive thing is fine.

Signs a file needs to be split:
- You have to scroll to find the function you want
- Adding a feature requires changes in multiple unrelated sections of the same file
- The filename cannot describe what the file does without using "and"

Flat directory structures are easier to navigate than deep ones. Create a subdirectory when you have three or more files that belong together, not before.

## Functions

One function, one job. If you need to comment what a section of a function does, that section should probably be its own function.

Keep functions short enough to read without scrolling. There is no hard line count, but if a function exceeds 40–50 lines, ask whether it is doing more than one thing.

Avoid deeply nested logic. Early returns flatten nesting:

```ts
// Nested
function process(user) {
  if (user) {
    if (user.active) {
      if (user.verified) {
        return doWork(user);
      }
    }
  }
}

// Flat
function process(user) {
  if (!user) return;
  if (!user.active) return;
  if (!user.verified) return;
  return doWork(user);
}
```

## Naming

Names should describe what something is or does, not how it is implemented. A reader should not need to look at a function's body to understand what calling it does.

- Variables and functions: `camelCase`
- Classes and types: `PascalCase`
- Constants: `SCREAMING_SNAKE_CASE` only for true module-level constants, not for every `const`
- Files: `kebab-case` for most ecosystems, match what the project already uses
- Booleans: prefix with `is`, `has`, `can`, `should` — `isExpired`, `hasAccess`
- Functions that return a value: use a noun or noun phrase — `getUser`, `buildToken`
- Functions that perform an action: use a verb — `sendEmail`, `revokeSession`

Avoid abbreviations unless they are universally understood in the domain (`id`, `url`, `ip`, `ttl`). `usrNm` is not an improvement over `username`.

## No magic values

Named constants, not bare literals:

```ts
// Bad
if (token.length < 32) { ... }
await redis.setex(key, 900, value);

// Good
const MIN_TOKEN_LENGTH = 32;
const SESSION_TTL_SECONDS = 900;
```

This applies to strings too. `status === "active"` scattered across 10 files is a refactoring hazard.

## Comments

Write a comment only when the WHY is non-obvious: a hidden constraint, a subtle invariant, a workaround for a specific bug, behavior that would surprise a reader. If removing the comment would not confuse a future reader, omit it.

Never narrate what the code does. Well-named identifiers already do that. Never reference the current task, fix, or caller.

One short line per comment. No multi-line blocks unless the WHY genuinely requires more than one sentence.

Rules:
- No em dashes (U+2014). Use a colon, comma, or rewrite the sentence.
- No ALL CAPS words.
- No exclamation marks.

## Imports

Group imports: external packages first, then internal modules, separated by a blank line. Within each group, order alphabetically or by proximity to the current module — pick one and be consistent.

Delete unused imports immediately. They mislead readers about what a module depends on.

## Abstraction

Abstract when you have two or more concrete things that share the same shape. Do not abstract in anticipation of a third thing that may never arrive.

Three similar-looking lines of code is better than a premature helper that requires reading a separate file to understand. Abstract when the duplication causes a maintenance problem, not when it offends aesthetic sensibility.

## Avoid

- Functions that do something and return whether they succeeded — split into a predicate and an action
- Boolean parameters that change function behavior — use two functions or an options object
- Output parameters (mutating an argument to "return" a value)
- Classes with one method that is not a constructor — use a function
- Re-exporting things just to create a "barrel" that nothing actually needs
