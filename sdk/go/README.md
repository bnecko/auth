# Go example client

This is an unsupported example, not a packaged SDK: no module definition,
tests, versioning, or release process, and it covers only userinfo,
introspection, and webhook verification. Copy what you need into your own
project and adapt it.

The supported SDK is the Node package in [`sdk/node`](../node). The full HTTP
API is documented in [`docs/external-apps.md`](../../docs/external-apps.md)
and [`docs/oauth.md`](../../docs/oauth.md) and is easy to call directly from
Go.

Notes for adapting:

- Client credentials are sent in the form body (`client_secret_post`), which
  is how apps created through the developer dashboard are registered.
- `VerifyWebhookSignature` checks HMAC and timestamp freshness (5 minutes).
  Deduplicate deliveries on the `X-Bottleneck-Delivery` header id.
