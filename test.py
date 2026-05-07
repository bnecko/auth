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

import time
import json

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
    
    print(f"Creating activation request at {base_url}/api/activation-requests ...")
    
    try:
        response = requests.post(f"{base_url}/api/activation-requests", headers=headers, json=payload)
        
        if not response.ok:
            print("Failed to create activation request.")
            print(response.text)
            return

        data = response.json()
        activation_id = data['id']
        activation_url = data['activationUrl']
        
        print("\n" + "="*50)
        print("ACTION REQUIRED:")
        print("Please open the following URL in your browser, log in, and approve the request:")
        print(activation_url)
        print("="*50 + "\n")
        
        print(f"Polling activation status for {activation_id}...")
        
        while True:
            poll_resp = requests.get(f"{base_url}/api/activation-requests/{activation_id}", headers=headers)
            if not poll_resp.ok:
                print("\nError polling status:")
                print(poll_resp.text)
                break
                
            poll_data = poll_resp.json()
            status = poll_data.get("status")
            
            if status == "pending":
                sys.stdout.write(".")
                sys.stdout.flush()
                time.sleep(3)
            elif status == "approved":
                print("\n\nSuccess! Activation approved.")
                print("Resulting Auth Data (including approvedUserId):")
                print(json.dumps(poll_data, indent=2))
                print("\nNote: Bottleneck Auth currently only returns 'approvedUserId' to external apps.")
                break
            else:
                print(f"\n\nActivation ended with status: {status}")
                break
            
    except Exception as e:
        print(f"\nError connecting to API: {e}")

if __name__ == "__main__":
    test_auth_api()
