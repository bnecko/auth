import os
import sys
import requests

# Try to manually load variables from .env file
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

def test_auth_api():
    token = os.environ.get("TEST_BEARER")
    if not token:
        print("Error: TEST_BEARER environment variable not set (and not found in .env)")
        sys.exit(1)

    base_url = "https://auth.bottleneck.cc"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "requestedSubject": "test-script-user",
        "scopes": ["profile:read"]
    }
    
    print(f"Testing POST {base_url}/api/activation-requests ...")
    
    try:
        response = requests.post(f"{base_url}/api/activation-requests", headers=headers, json=payload)
        print(f"Status Code: {response.status_code}")
        try:
            data = response.json()
            print("Response JSON:")
            import json
            print(json.dumps(data, indent=2))
        except Exception:
            print("Response Text:")
            print(response.text)
            
        if response.ok:
            print("Success!")
        else:
            print("Failed.")
            
    except Exception as e:
        print(f"Error connecting to API: {e}")

if __name__ == "__main__":
    test_auth_api()
