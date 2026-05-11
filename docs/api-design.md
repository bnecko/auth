# API Design

## Consistency is the goal

A well-designed API is predictable. A developer who has used one endpoint should be able to guess the shape of the next one. Inconsistency forces every caller to special-case your API.

## Response shape

Pick one shape and never deviate. Success and error responses should be distinguishable by HTTP status code, not by inspecting the body for a flag.

Success:
```json
{ "user": { "id": "u_123", "email": "alex@example.com" } }
```

Error:
```json
{ "error": "email_taken" }
```

Do not use `{ "success": true, "data": ... }` wrappers. They add noise without adding information — the status code already tells you whether it succeeded.

## HTTP methods

Use them correctly:

- `GET` — read only, no side effects, safe to retry
- `POST` — create or trigger an action
- `PUT` — replace a resource entirely
- `PATCH` — partial update
- `DELETE` — remove

Never use `GET` to trigger mutations. Never use `POST` where `GET` would do.

## Naming

Use nouns for resources, not verbs:

```
POST /sessions          (not /login)
DELETE /sessions/:id    (not /logout)
POST /password-resets   (not /resetPassword)
```

Use kebab-case for paths. Use snake_case for JSON field names. Be consistent — do not mix conventions across endpoints.

Plural for collections: `/users`, `/tokens`, `/sessions`. Singular for singletons: `/me`, `/config`.

## Idempotency

`GET`, `PUT`, and `DELETE` should be idempotent — calling them twice should produce the same result as calling them once. Design `POST` endpoints to be idempotent where possible (e.g. an idempotency key header), especially for anything that moves money, sends messages, or creates records.

## Status codes

Return the right code. See `error-handling.md` for the full table. A 200 with `{ "error": "..." }` in the body is wrong.

For creates, return 201 with the created resource. For actions that trigger async work, return 202. For successful deletes or actions with no response body, return 204.

## Avoid over-fetching and under-fetching

Each endpoint should return what its callers actually need — not everything in the database, not so little that two requests are required to render one screen.

If one endpoint returns a list and another returns a single item, the list items should include enough fields to render a list row without fetching the detail endpoint for each one.

## Versioning

Do not version unless you have breaking changes and existing clients you cannot update. Premature versioning creates two codepaths to maintain.

When you do need to version, version the whole API with a prefix: `/v2/...`. Do not version individual endpoints.

## What belongs in headers vs body

- Auth credentials: `Authorization` header
- Content type: `Content-Type` header
- Pagination cursors: query parameters for `GET`, body for `POST`
- Resource data: body
- Idempotency keys: header (`Idempotency-Key`)

Do not put auth tokens in query parameters. They appear in server logs and browser history.

## Pagination

For list endpoints that can return many records, paginate by default. Cursor-based pagination scales better than offset-based and avoids the "page drift" problem when records are inserted mid-browse.

Return the cursor in the response:
```json
{
  "items": [...],
  "next_cursor": "eyJpZCI6MTIzfQ"
}
```

No `next_cursor` (or `null`) means there are no more pages. Do not force callers to detect an empty page.

## Do not surprise callers

- A field that is sometimes present and sometimes absent is worse than a field that is always present and sometimes null.
- A list endpoint that returns an object when there is exactly one result is a bug.
- An endpoint that silently ignores unknown fields is fine. An endpoint that returns a 400 for unknown fields punishes forward-compatible clients.
- Error codes should be stable strings, not numbers. `"token_expired"` is searchable; `4012` is not.
