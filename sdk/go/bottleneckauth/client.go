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
	"strings"
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
	req, err := http.NewRequest("POST", strings.TrimRight(c.Issuer, "/")+"/api/oauth/introspect", bytes.NewBufferString(body.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	if c.ClientID != "" && c.ClientSecret != "" {
		req.SetBasicAuth(c.ClientID, c.ClientSecret)
	}
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

func VerifyWebhookSignature(secret, timestamp string, body []byte, signature string) bool {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(timestamp))
	mac.Write([]byte("."))
	mac.Write(body)
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(signature))
}
