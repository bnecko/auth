import os
import sys
import time
import json
import requests

try:
    with open('.env') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                if key not in os.environ:
                    os.environ[key] = value.strip('"\'')
except FileNotFoundError:
    pass

def main():
    token = os.environ.get("TEST_BEARER")
    if not token:
        sys.exit("TEST_BEARER environment variable missing")

    base_url = "https://auth.bottleneck.cc"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    
    payload = {
        "requestedSubject": "test-script-user",
        "scopes": ["profile:read", "email:read", "dob:read"],
    }
    
    resp = requests.post(f"{base_url}/api/activation-requests", headers=headers, json=payload)
    if not resp.ok:
        sys.exit(f"failed to create activation request: {resp.text}")

    data = resp.json()
    activation_id = data["id"]
    
    print(f"Activation URL: {data['activationUrl']}")
    
    while True:
        poll_resp = requests.get(f"{base_url}/api/activation-requests/{activation_id}", headers=headers)
        if not poll_resp.ok:
            sys.exit(f"error polling status: {poll_resp.text}")
            
        poll_data = poll_resp.json()
        status = poll_data.get("status")
        
        if status == "pending":
            time.sleep(2)
        elif status == "approved":
            print(json.dumps(poll_data, indent=2))
            break
        else:
            print(f"status: {status}")
            break

if __name__ == "__main__":
    main()
