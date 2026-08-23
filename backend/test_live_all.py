"""Query live Render backends and test all endpoints directly."""
import requests
import json

backends = ["https://rag-project-2-0.onrender.com", "https://smartdoc-backend-vjih.onrender.com"]

for base in backends:
    print(f"\n==================== Testing: {base} ====================")
    try:
        ping = requests.get(f"{base}/api/chat/test-gemini", timeout=20)
        print(f"/api/chat/test-gemini -> HTTP {ping.status_code}: {ping.text}")
    except Exception as e:
        print(f"/api/chat/test-gemini failed: {e}")

    # Login
    user = {"email": "live_user_test@example.com", "password": "Password123!", "name": "Test"}
    requests.post(f"{base}/api/auth/register", json=user, timeout=10)
    log_res = requests.post(f"{base}/api/auth/login", json={"email": user["email"], "password": user["password"]}, timeout=10)
    token = log_res.json().get('data', {}).get('access_token')
    if not token:
        print(f"Login failed: {log_res.text}")
        continue
    
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    try:
        chat_res = requests.post(f"{base}/api/chat/ask", json={"question": "what is java"}, headers=headers, timeout=25)
        print(f"/api/chat/ask -> HTTP {chat_res.status_code}: {chat_res.text[:400]}")
    except Exception as e:
        print(f"/api/chat/ask failed: {e}")
