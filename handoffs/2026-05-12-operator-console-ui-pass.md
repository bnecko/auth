## Operator Console UI Pass

**Date:** 2026-05-12
**Purpose:** Extend the "Operator Console" aesthetic from shared chrome and the dashboard onto every remaining page, then iterate on the search palette and code-block presentation in response to visual review.

## Context

The previous session (commit `11bf75f`) introduced the Operator Console design system — one typeface (JetBrains Mono), one accent (phosphor amber), rule lines instead of bordered cards, square corners, no shadows — but only converted the shared chrome (TopNav, Sidebar, AdminSidebar) and the dashboard. Every other page still mixed legacy palette aliases (`border-border`, `bg-surface`, `text-success`, etc.) and bordered-card patterns. This pass closes that gap, then iterates on the search palette and CodeTabs based on screenshot feedback.

A hidden accent-swap easter egg was also added by user request: typing `blood` outside any input swaps `--accent` for `#ff003c`. Persists in localStorage.

## What changed

### Auth flow
- `app/login/page.tsx` — remember-me checkbox dropped the bordered-box pattern for an inline `appearance-none` accent-tick; secondary links recolored to `text-secondary hover:text-accent`.
- `app/register/page.tsx`, `app/forgot/page.tsx`, `app/forgot/reset/page.tsx` — symmetric 28px heading + 7-unit body gap, single-style links, Suspense fallback now renders a `▌ loading` cursor.
- `app/verify/page.tsx`, `app/login/telegram/page.tsx`, `app/relink/page.tsx` — replaced the bordered "telegram channel" cards with a two-row rule strip (`channel / expires in`) and a blinking `Cursor` while polling.
- `app/expired/page.tsx` — adds an `err {code}` header line (one of 400 / 410 / 403 / 503) above the title.
- `app/device/page.tsx` — code-entry rewritten with rule-only divider and amber zero-padded count of scopes; success state uses the `+ connected` glyph header.

### High-traffic consent
- `app/oauth/authorize/page.tsx`, `app/activate/page.tsx` — bordered-card header replaced by a 12-unit accent-bordered initial monogram + RFC-style detail rows; scope list split into "standard" (rule-line items with `+` glyph) and "sensitive" (checkbox-style toggles, default-checked, `optional` tag).

### Account surfaces
- `app/security/page.tsx` — `$ security.center` command crumb, 32px header, 4-column stats strip with 34px amber zero-padded numerals, RFC sections 1.0–5.0, mount-stagger.
- `app/request-bearer/page.tsx` — bordered-card form dropped; description textarea is now a single rule-line with focus-accent.
- `app/user/[username]/page.tsx` — initials in an accent-bordered 16×16 square, sticky `$ user.profile` crumb, `> end of profile` cursor below.

### Developer portal
- `app/developers/apps/page.tsx` — list rows are rule-line `grid-cols-[1fr_220px_140px_auto]` with `>` chevron hover.
- `app/developers/apps/new/page.tsx`, `app/developers/apps/new/ClientForm.tsx` — created-state shows `+ application created` glyph header with `! shown once` warning under client secret.
- `app/developers/apps/[slug]/page.tsx`, `AppSettingsForm.tsx`, `WebhookEndpointsSection.tsx`, `CopyValue.tsx` — config / oauth version / danger zone split into RFC-numbered Sections; webhook event toggles use the new `appearance-none` accent-tick.
- `app/developers/oauth/page.tsx` — DocSection rewritten as RFC-numbered headers (1.0–19.0), bordered article + sidebar dropped, sticky right contents nav is now plain rule-line links, lifetimes/scopes/endpoints reflowed through a `DataGrid` helper. **Language examples (Node.js, Python) added** to: discovery, PAR, client credentials, refresh, userinfo, introspect, revoke, activation create, activation poll.
- `app/developers/test-lab/page.tsx`, `test-lab.tsx` — Panel wrapper dropped in favor of Section; right column was originally numbered `5.0 / 6.0` adjacent to left `1.0 / 2.0` which read as a broken sequence, so right column lost its indices and gained an `[ aux · side panels ]` label.

### Admin surface
- `app/admin/page.tsx`, `users/page.tsx`, `oauth-clients/page.tsx`, `activation-requests/page.tsx`, `webhooks/page.tsx`, `keys/page.tsx`, `security/page.tsx`, `bans/page.tsx`, `verify/page.tsx`, `verify/TelegramStepUpWidget.tsx` — every admin page gets the `$ admin.<area>` command crumb in **danger red** (not amber, to mark elevated context), 32px headers, RFC-numbered Sections, and rule-line list rows. Filters on `/admin/webhooks` and `/admin/security` use `■ active` markers instead of pill buttons. The audit console filter form uses underline-only inputs.

### Iterated component fixes (commits e0ea6e7 → 713cdd7)
- `components/Sidebar.tsx` — SearchPalette: added `backdrop-blur-md` (real blur, not a darken), repositioned at `pt-[18vh]`, width bumped to 580px, `palette-mount` rise-and-fade animation added; input row repadded from `h-12 px-4` to `p-4` so it has 16px symmetric breathing space; mouse hover now selects rows (parity with arrow keys); footer shows zero-padded match counter (`03/13` style); `focus-visible:outline-none` on input to suppress the global accent ring.
- `app/developers/oauth/CodeTabs.tsx` — outer `border-t/border-b border-rule bg-bg-soft` sandwich dropped; tab strip is now always shown (incl. single-tab) with only its own `border-b` separator; `px-3` tab/code padding aligned.
- `app/globals.css` — `.oauth-code-block` background changed from `var(--bg-soft)` to `transparent` so code blocks sit on page bg cleanly. Added `@keyframes overlay-in` and `palette-in` plus `.overlay-mount` / `.palette-mount` classes with reduced-motion fallback.
- `app/developers/test-lab/test-lab.tsx` — `LabField` / `LabText` / `LabSelect` gained `bg-bg-soft` fill + `px-3 h-9` framing so the field area is unmistakable against the page.
- `components/Button.tsx` — added `px-4` to the base class so content-sized buttons in inline parents (`<Link><Button>+ new app</Button></Link>`) get proper horizontal breathing room.

### Easter egg
- `components/ThemeEasterEgg.tsx` *(new)* — client component listening for the literal sequence `blood` typed on `window` (skips when the target is `INPUT` / `TEXTAREA` / `contenteditable`, or any modifier is held). On match, toggles `--accent: #ff003c` + `--accent-dim: #5c0017` and persists `bn-theme=blood` in localStorage. Type again to revert.
- `app/layout.tsx` — mounts `<ThemeEasterEgg />` in body; adds an inline pre-hydration script (nonced) in `<head>` that reads `localStorage` and applies the saved accent before paint so reloads do not flash amber.

## What was NOT done

- **Blood easter egg was not visually verified in production CSP.** The inline `<script nonce={…}>` should be permitted by the existing `strict-dynamic` policy from commit `1bf1584`, but no manual browser test confirmed it actually fires after redeploy. **Risk:** if the prod CSP differs, the inline bootstrap could be blocked and trigger a brief amber-to-red flash on every reload while the localStorage state still applies post-hydration.
- **No Playwright coverage for the visual rework.** Pages were typecheck-clean and `npm run build` clean, but the only behavioral test is the existing `tests/e2e/auth-flows.spec.ts` CSP smoke. Visual regressions on Section / Row / Tag / Glyph would not be caught by CI.
- **Prism syntax-highlight theme not customized.** Code blocks still use `prism-tomorrow` defaults. With the new transparent background the colors mostly read fine, but tokens do not pick up the amber accent.
- **OAuth docs language coverage uneven.** Added Node.js + Python to single-tab cURL blocks (discovery, PAR, client credentials, refresh, userinfo, introspect, revoke, activation create/poll). Activation cancel section appears not to exist in the current file. The Authorize section stays URL-only (it's not code). Errors / lifetimes / scopes / endpoints stay as DataGrid tables.
- **`prefers-reduced-motion` not manually exercised** for the new `palette-mount` and `overlay-mount` animations. The CSS rule is in place (`@media (prefers-reduced-motion: reduce)` block in `globals.css`) but not tested with the OS toggle on.
- **The admin surface uses danger-red `$` crumbs but no warning banner.** Consistent with the AdminSidebar monogram styling, but a first-time admin viewer may not realize the red signifies elevated context.
- **Search-palette match counter (`03/13`) is a counter, not a "use Enter to open" hint.** Discoverability of the counter itself is minor but unverified.
- **Test lab field bg-soft fill** is currently only applied to LabField / LabText / LabSelect inside test-lab.tsx. The dashboard's general `<Field>` component (`components/Field.tsx`) still uses the underline-only treatment by design — left untouched.

## Verification

- `npm run typecheck` — clean (run after every batch).
- `npm run build` — clean (4 builds across the session, last one 22:55 local).
- `npm run test:run` — 85 passed / 39 skipped (unit; integration suite gated on `DATABASE_URL`).
- Pre-push hook (`npm run typecheck` + `test.py` integration suite on auth-test-db:5433) — passed on all four pushes: 111 passed / 13 skipped.
- Docker rebuild + `docker compose up -d app` — `Container auth-app-1 Started` and `Ready in 68ms` confirmed for each push.
- **Not run:** no manual browser verification of: backdrop-blur effect, palette mount animation, blood easter egg toggle, OAuth docs Node.js/Python tab switching, test-lab field visibility under the new bg-soft fill, admin pages on real browser.
- **Not run:** no `prefers-reduced-motion` check.

## Follow-ups

- Manually verify `blood` easter egg at `https://auth.bottleneck.cc/` after redeploy. Steps: load any page, click a non-input area, type `b-l-o-o-d` within 1.5s, confirm the accent shifts from `#ffb000` to `#ff003c` across `text-accent`, `border-accent`, `bg-accent`, and `::selection`. Reload and confirm no flash. Type `blood` again to revert.
- If the CSP blocks the inline pre-hydration script, move the bootstrap into a `<Script id="theme-init" strategy="beforeInteractive">` or accept the one-frame flash and remove the inline block from `app/layout.tsx:21-23`.
- Add a Playwright snapshot test for at least: `/` (dashboard), `/login`, `/oauth/authorize`, `/admin`, `/admin/security`. Visual regressions in Section / Row / Tag would otherwise go unnoticed.
- Consider customizing Prism token colors in `app/globals.css` to harmonize keywords / strings / numbers with the amber accent (or the blood accent when active). The current `prism-tomorrow` import is at `app/developers/oauth/CodeTabs.tsx:9`.
- Confirm with the user whether the admin red-`$` crumb is enough signal for elevated context, or whether a session-banner is wanted.
- Optionally extend the easter egg with more theme variants. `components/ThemeEasterEgg.tsx:11-13` defines `BLOOD_ACCENT` / `BLOOD_ACCENT_DIM` / `SEQUENCE` — adding green-phosphor or white-CRT variants is mechanical.

## Files touched

Auth flow:
- `app/login/page.tsx`
- `app/register/page.tsx`
- `app/forgot/page.tsx`
- `app/forgot/reset/page.tsx`
- `app/verify/page.tsx`
- `app/login/telegram/page.tsx`
- `app/relink/page.tsx`
- `app/expired/page.tsx`
- `app/device/page.tsx`

Consent / account:
- `app/oauth/authorize/page.tsx`
- `app/activate/page.tsx`
- `app/security/page.tsx`
- `app/request-bearer/page.tsx`
- `app/user/[username]/page.tsx`

Developer portal:
- `app/developers/apps/page.tsx`
- `app/developers/apps/new/page.tsx`
- `app/developers/apps/new/ClientForm.tsx`
- `app/developers/apps/[slug]/page.tsx`
- `app/developers/apps/[slug]/AppSettingsForm.tsx`
- `app/developers/apps/[slug]/WebhookEndpointsSection.tsx`
- `app/developers/apps/[slug]/CopyValue.tsx`
- `app/developers/oauth/page.tsx`
- `app/developers/oauth/CodeTabs.tsx`
- `app/developers/test-lab/page.tsx`
- `app/developers/test-lab/test-lab.tsx`

Admin surface:
- `app/admin/page.tsx`
- `app/admin/users/page.tsx`
- `app/admin/oauth-clients/page.tsx`
- `app/admin/activation-requests/page.tsx`
- `app/admin/webhooks/page.tsx`
- `app/admin/keys/page.tsx`
- `app/admin/security/page.tsx`
- `app/admin/bans/page.tsx`
- `app/admin/verify/page.tsx`
- `app/admin/verify/TelegramStepUpWidget.tsx`

Shared chrome / components:
- `components/Sidebar.tsx`
- `components/TopNav.tsx`
- `components/AdminSidebar.tsx`
- `components/Button.tsx`
- `components/Divider.tsx`
- `components/PasskeyManager.tsx`
- `components/BearerSection.tsx`
- `components/TurnstileField.tsx`
- `components/ThemeEasterEgg.tsx` (new)

Root:
- `app/layout.tsx`
- `app/globals.css`
