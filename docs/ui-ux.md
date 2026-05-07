# Bottleneck Auth UI/UX

## Direction

The interface should feel like a focused auth product, not a marketing site.

References:

- OpenAI login pages
- Anthropic login pages
- Cloudflare dashboard/auth screens

Visual direction:

- jet-black background
- minimal panels
- sharp typography
- quiet borders
- restrained color
- no decorative gradients
- no oversized hero section
- no playful illustrations
- no cards inside cards

The user should immediately understand what action is required.

## Design Principles

- Auth screens should be calm and narrow.
- Dashboard screens should be dense but readable.
- Avoid marketing copy.
- Avoid visible instructions unless they reduce real confusion.
- Keep labels clear and direct.
- Use one primary action per screen.
- External app activation should show trust-critical details before approval.
- Public fields and private fields must be visually distinguished.

## Visual Style

### Colors

Base:

- background: near black, for example `#050505` or `#070707`
- surface: `#0f0f10`
- elevated surface: `#151516`
- border: `#27272a`
- primary text: `#f4f4f5`
- secondary text: `#a1a1aa`
- muted text: `#71717a`

Accent:

- primary action: white or near-white button on dark background
- destructive: muted red
- success: muted green
- warning: muted amber

Avoid a one-color theme. The UI should read as black, white, and neutral gray with small semantic accents.

### Typography

- Use a modern sans-serif stack.
- Use compact headings.
- Use normal letter spacing.
- Do not scale font size with viewport width.
- Labels should be smaller than field values.
- Dashboard numbers can be slightly larger, but not hero-sized.

Suggested hierarchy:

- page title: 24-30px
- section heading: 16-18px
- body: 14-15px
- metadata: 12-13px

### Layout

Auth pages:

- centered narrow panel
- max width around 420-480px
- full viewport height
- no split hero layout
- no background blobs or orbs

Dashboard:

- top navigation bar
- left sidebar only if there are enough sections
- content max width around 1080-1200px
- simple rows/tables for events and sessions
- small summary blocks for stats

## Screens

## Login

Purpose:

Let existing users authenticate quickly.

Elements:

- Bottleneck wordmark or simple text mark
- title: `Sign in`
- username/email field
- password field
- primary button: `Continue`
- secondary link: `Create account`
- secondary link: `Forgot password`
- optional divider
- button: `Continue with Telegram`

States:

- default
- loading
- invalid credentials
- rate limited
- Turnstile required
- banned account

Notes:

- Keep errors short and specific.
- Do not reveal whether an email exists.
- Password manager support matters.

## Register

Purpose:

Create a Bottleneck account and bind Telegram identity.

Fields:

- first name
- username
- bio, optional
- email
- date of birth, optional
- password

Field notes:

- Bio note: `Shown publicly.`
- Date of birth note: `Optional. May be used by external apps when you approve it.`
- Telegram note: `Required to complete account creation.`

Primary action:

- `Verify with Telegram and complete`

Secondary action:

- `Sign in instead`

States:

- username unavailable
- weak password
- invalid email
- Turnstile failed
- Telegram verification failed
- Telegram account already linked
- account created

UX requirement:

The Telegram verification should feel like the final step, not a separate confusing flow.

## Telegram Verification

Two acceptable options:

### Telegram Login Widget

Use when possible.

Flow:

1. User clicks `Verify with Telegram and complete`.
2. Telegram auth popup/widget appears.
3. Server verifies Telegram signature.
4. User lands on dashboard or activation approval.

### Telegram Bot Verification

Use if widget limitations make the flow awkward.

Flow:

1. User clicks `Verify with Telegram and complete`.
2. Page shows a one-time code and a button to open the bot.
3. User sends `/start <code>` to the bot.
4. Page updates when verified.
5. Account is completed.

The bot must be separate from the current readme-bottleneck bot.

## Activation Approval

Purpose:

Let a logged-in user approve or deny a request from an external app.

Elements:

- app name
- app icon if available
- request status
- signed-in user
- requested scopes
- subscription requirement
- token expiry countdown
- request IP/device summary if useful
- primary button: `Approve`
- secondary button: `Deny`

Example scopes display:

- Public profile
- Email address
- Date of birth
- Subscription status

Rules:

- Make the app name prominent.
- Make sensitive scopes visually obvious.
- If the subscription is missing or expired, disable approve and show the reason.
- If token is expired, show a terminal expired state.

## Dashboard

Route:

- `https://auth.bottleneck.cc/`

Shown when there is no activation token in the URL.

Purpose:

Give the user a quick account overview and basic control.

Tone:

Quiet, black, compact, utility-focused.

Top area:

- account name
- username
- Telegram verification status
- account status

Stats:

- active subscriptions
- connected apps
- active sessions
- recent activations

Sections:

- Profile
- Subscriptions
- Connected apps
- Sessions
- Security

Profile section:

- first name
- username
- bio
- email
- date of birth
- Telegram account

Subscriptions section:

- product
- status
- expiry
- revoke/cancel action if applicable

Connected apps section:

- app name
- scopes
- authorized date
- revoke button

Sessions section:

- device/browser
- location/IP summary
- last active
- revoke button

Security section:

- password change
- Telegram relink
- recent security events

## Empty States

Use concise empty states:

- `No connected apps`
- `No active subscriptions`
- `No recent activations`

Do not use long explanatory empty states.

## Error Pages

Use the same dark minimal shell.

Needed states:

- invalid activation token
- expired activation token
- denied activation
- app unavailable
- account banned
- rate limited
- server error

Each page should include:

- short title
- one-sentence reason
- one useful action

Examples:

- `Activation expired`
- `This request is no longer valid.`
- button: `Return to dashboard`

## Admin UI

Admin should use the same visual system but denser tables.

Sections:

- users
- activation requests
- external apps
- subscriptions
- bans
- security events

Admin actions:

- ban user
- unban user
- revoke sessions
- revoke app authorization
- revoke subscription
- inspect activation request

Dangerous actions require confirmation.

## Responsive Behavior

Mobile:

- auth panel uses full width with 16px margins
- dashboard sections stack vertically
- tables become row cards or horizontally scroll only when necessary
- primary action remains visible without overlapping content

Desktop:

- auth panel remains narrow
- dashboard uses max-width content area
- admin tables can be wider

## Copy Guidelines

Use direct labels:

- `Sign in`
- `Create account`
- `Verify with Telegram and complete`
- `Approve`
- `Deny`
- `Revoke`
- `Banned`
- `Limited`
- `Active`

Avoid:

- marketing text
- jokes
- long onboarding text
- "Welcome to the future" style copy
- technical details that only admins need

## Accessibility

- All fields need labels.
- Focus states must be visible.
- Error text must be connected to fields.
- Buttons must not rely only on color.
- Contrast must pass on dark background.
- Keyboard navigation must work through forms and dialogs.

## First UI Deliverables

Design these first:

- login page
- register page
- Telegram verification state
- activation approval page
- dashboard
- invalid/expired activation page

Admin UI can come after the public flow is stable.
