"""Query both Render backends to see exact error response."""
import requests

backends = ["https://rag-project-2-0.onrender.com", "https://smartdoc-backend-vjih.onrender.com"]

for base in backends:
    print(f"\n==================== Testing: {base} ====================")
    user = {"email": "check_ai_user@example.com", "password": "Password123!", "name": "AI Tester"}
    requests.post(f"{base}/api/auth/register", json=user, timeout=10)
    log_res = requests.post(f"{base}/api/auth/login", json={"email": user["email"], "password": user["password"]}, timeout=10)
    token = log_res.json().get('data', {}).get('access_token')
    if not token:
        print(f"Login failed: {log_res.text}")
        continue
    
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    print("Calling /api/chat/ask with 'what is java'...")
    try:
        res = requests.post(f"{base}/api/chat/ask", json={"question": "what is java"}, headers=headers, timeout=20)
        print(f"HTTP Status: {res.status_code}")
        print(f"Response: {res.text[:400]}")
    except Exception as e:
        print(f"Exception: {e}")
