"""Test both Render backend live URLs directly."""
import requests
import json

backends = [
    "https://rag-project-2-0.onrender.com",
    "https://smartdoc-backend-vjih.onrender.com"
]

print("=" * 60)
print("TESTING LIVE RENDER BACKENDS")
print("=" * 60)

for base in backends:
    print(f"\n---> Testing backend: {base}")
    # 1. Health check
    try:
        res = requests.get(f"{base}/", timeout=15)
        print(f"  Root / -> HTTP {res.status_code}: {res.text[:100]}")
    except Exception as e:
        print(f"  Root / failed: {e}")

    # 2. Register/Login test user to get JWT token
    test_user = {"email": "render_test_auto@example.com", "password": "Password123!", "name": "Render Tester"}
    token = None
    try:
        reg_res = requests.post(f"{base}/api/auth/register", json=test_user, timeout=15)
        print(f"  Register -> HTTP {reg_res.status_code}: {reg_res.text[:100]}")
        if reg_res.status_code in (200, 201):
            token = reg_res.json().get('data', {}).get('access_token')
    except Exception as e:
        print(f"  Register failed: {e}")

    if not token:
        try:
            log_res = requests.post(f"{base}/api/auth/login", json={"email": test_user["email"], "password": test_user["password"]}, timeout=15)
            print(f"  Login -> HTTP {log_res.status_code}")
            if log_res.status_code == 200:
                token = log_res.json().get('data', {}).get('access_token')
        except Exception as e:
            print(f"  Login failed: {e}")

    if not token:
        print("  Could not obtain JWT token.")
        continue

    # 3. Test chat endpoint with question "what is java"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    chat_payload = {
        "question": "what is java",
        "explanation_mode": "normal",
        "language": "English"
    }
    try:
        print("  Sending chat message: 'what is java'...")
        chat_res = requests.post(f"{base}/api/chat/ask", json=chat_payload, headers=headers, timeout=25)
        print(f"  Chat /api/chat/ask -> HTTP {chat_res.status_code}: {chat_res.text[:300]}")
    except Exception as e:
        print(f"  Chat request failed: {e}")

print("\nDIAGNOSTIC TEST COMPLETE.")
