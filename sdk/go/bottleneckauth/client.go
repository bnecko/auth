package bottleneckauth

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type Client struct {
	Issuer       string
	ClientID     string
	ClientSecret string
	HTTPClient   *http.Client
}

func (c Client) Userinfo(accessToken string, out any) error {
	req, err := http.NewRequest("GET", strings.TrimRight(c.Issuer, "/")+"/api/oauth/userinfo", nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	return c.doJSON(req, out)
}

func (c Client) Introspect(token string, out any) error {
	body := url.Values{"token": []string{token}}
	// client_secret_post: self-service apps are registered with this method,
	// and the server rejects Basic auth for them. Public clients still have
	// to identify themselves with client_id alone.
	if c.ClientID != "" {
		body.Set("client_id", c.ClientID)
		if c.ClientSecret != "" {
			body.Set("client_secret", c.ClientSecret)
		}
	}
	req, err := http.NewRequest("POST", strings.TrimRight(c.Issuer, "/")+"/api/oauth/introspect", bytes.NewBufferString(body.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	return c.doJSON(req, out)
}

func (c Client) doJSON(req *http.Request, out any) error {
	client := c.HTTPClient
	if client == nil {
		client = http.DefaultClient
	}
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("bottleneck auth: http %d", res.StatusCode)
	}
	return json.NewDecoder(res.Body).Decode(out)
}

const webhookToleranceSeconds = 300

// Checks authenticity and freshness: a valid signature over a timestamp more
// than five minutes from the local clock is rejected as a replay. Deduplicate
// deliveries inside the window on the X-Bottleneck-Delivery id.
func VerifyWebhookSignature(secret, timestamp string, body []byte, signature string) bool {
	ts, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil {
		return false
	}
	age := time.Now().Unix() - ts
	if age > webhookToleranceSeconds || age < -webhookToleranceSeconds {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(timestamp))
	mac.Write([]byte("."))
	mac.Write(body)
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(signature))
}
