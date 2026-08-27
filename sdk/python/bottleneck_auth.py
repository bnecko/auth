import hmac
import hashlib
import json
import time
from urllib import request, parse


class BottleneckAuthClient:
    def __init__(self, issuer, client_id=None, client_secret=None):
        self.issuer = issuer.rstrip("/")
        self.client_id = client_id
        self.client_secret = client_secret

    def userinfo(self, access_token):
        req = request.Request(
            f"{self.issuer}/api/oauth/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        with request.urlopen(req, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))

    def introspect(self, token):
        fields = {"token": token}
        # client_secret_post: self-service apps are registered with this
        # method, and the server rejects Basic auth for them.
        if self.client_id and self.client_secret:
            fields["client_id"] = self.client_id
            fields["client_secret"] = self.client_secret
        body = parse.urlencode(fields).encode("utf-8")
        headers = {"Content-Type": "application/x-www-form-urlencoded"}

        req = request.Request(
            f"{self.issuer}/api/oauth/introspect",
            data=body,
            headers=headers,
            method="POST",
        )
        with request.urlopen(req, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))


def verify_webhook_signature(secret, timestamp, body, signature, tolerance_seconds=300):
    # Checks authenticity and freshness: a valid signature over a timestamp
    # outside the tolerance window is rejected as a replay. Deduplicate
    # deliveries inside the window on the X-Bottleneck-Delivery id.
    try:
        ts = int(timestamp)
    except (TypeError, ValueError):
        return False
    if abs(time.time() - ts) > tolerance_seconds:
        return False
    expected = hmac.new(
        secret.encode("utf-8"),
        f"{timestamp}.{body}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)
