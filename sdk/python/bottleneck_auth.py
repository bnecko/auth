import hmac
import hashlib
import json
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
        body = parse.urlencode({"token": token}).encode("utf-8")
        headers = {"Content-Type": "application/x-www-form-urlencoded"}
        if self.client_id and self.client_secret:
            import base64
            basic = base64.b64encode(
                f"{parse.quote(self.client_id)}:{parse.quote(self.client_secret)}".encode("utf-8")
            ).decode("ascii")
            headers["Authorization"] = f"Basic {basic}"

        req = request.Request(
            f"{self.issuer}/api/oauth/introspect",
            data=body,
            headers=headers,
            method="POST",
        )
        with request.urlopen(req, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))


def verify_webhook_signature(secret, timestamp, body, signature):
    expected = hmac.new(
        secret.encode("utf-8"),
        f"{timestamp}.{body}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)
