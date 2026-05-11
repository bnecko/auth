# Error Handling

## Two kinds of errors

**Operational errors** — expected failures: invalid input, missing record, expired token, rate limit hit, downstream service down. Handle these explicitly and return a clear response.

**Programmer errors** — bugs: null dereference, wrong type, broken invariant. Do not catch these. Let them crash and surface in logs.

Wrapping everything in a broad `try/catch` to avoid crashes is a code smell. It hides bugs and makes the system appear healthy when it is not.

## Propagate, don't swallow

If a function cannot handle an error meaningfully, it should let it propagate. Catching an error just to log it and re-throw is noise. Catching it to silently ignore it is a bug.

Bad:
```ts
try {
  await doSomething();
} catch (err) {
  console.error(err);
}
```

This discards the error and continues as if nothing happened. The caller has no idea the operation failed.

Only catch when you can do something useful: recover, translate to a domain error, or return a structured response to the client.

## What to return to the client

Return the minimum information needed for the client to act. Never leak:
- Stack traces
- Internal service names or URLs
- Database error messages
- File paths
- User IDs or internal identifiers not already known to the caller

A generic `"something went wrong"` is better than a stack trace in a 500 response, but a specific operational message is better than both: `"token expired"`, `"email already in use"`, `"rate limit exceeded"`.

## What to log

Log on the server what you strip from the client response. A 500 should always produce a server-side log entry with enough context to reproduce the issue: the error, the relevant inputs (sanitized of secrets), and the code path.

Do not log:
- Passwords, tokens, secrets, or keys
- Full request bodies if they may contain sensitive fields
- PII beyond what is necessary to debug the specific error

## HTTP semantics

Use the right status codes. Don't use 200 for errors.

| Situation | Code |
|---|---|
| Bad input from client | 400 |
| Missing or invalid auth token | 401 |
| Valid auth, insufficient permission | 403 |
| Resource does not exist | 404 |
| Rate limit exceeded | 429 |
| Unhandled server error | 500 |
| Downstream dependency failed | 502 / 503 |

401 means "you need to authenticate." 403 means "you are authenticated but not allowed." Do not use 404 to hide the existence of a resource from an unauthorized user unless that obscurity is a deliberate security decision.

## Consistent error shape

Pick one shape for error responses and use it everywhere:

```json
{ "error": "human-readable message" }
```

Or with a machine-readable code:

```json
{ "error": "token_expired", "message": "The access token has expired." }
```

Never mix shapes across endpoints. The client should be able to check one field to know whether a request failed.

## Error handling is not flow control

Do not use exceptions to drive normal program logic. If a function returns null for "not found," check for null. If a condition is expected, model it as a return value, not a thrown error.

## Fail fast at startup

Validate required configuration (environment variables, secrets, DB connectivity) at startup, not at request time. A service that starts successfully but silently fails on the first real request is harder to debug than one that refuses to start.
