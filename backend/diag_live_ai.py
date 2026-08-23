"""Directly query live Render server for chat and exam-prep endpoints to inspect exact response."""
import requests
import json

base = "https://rag-project-2-0.onrender.com"

print("=" * 60)
print(f"DIAGNOSING LIVE ENDPOINTS ON: {base}")
print("=" * 60)

# 1. Register/Login
user_cred = {"email": "live_diag_user@example.com", "password": "Password123!", "name": "Live Diag"}
requests.post(f"{base}/api/auth/register", json=user_cred, timeout=10)
log_res = requests.post(f"{base}/api/auth/login", json={"email": user_cred["email"], "password": user_cred["password"]}, timeout=10)
token = log_res.json().get('data', {}).get('access_token')

if not token:
    print(f"Failed to log in: {log_res.text}")
    exit(1)

print(f"Logged in successfully. Token: {token[:20]}...")
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

# 2. Test Exam Prep Strategy
print("\n[TEST 1] POST /api/exam-prep/strategy")
try:
    strat_res = requests.post(
        f"{base}/api/exam-prep/strategy", 
        json={"subject": "Data Structures", "unit": "Unit 1", "exam_type": "Semester Final", "days_remaining": 10}, 
        headers=headers, 
        timeout=30
    )
    print(f"Status Code: {strat_res.status_code}")
    print(f"Response Body: {strat_res.text[:400]}")
except Exception as e:
    print(f"Request exception: {e}")

# 3. Test Chat Ask
print("\n[TEST 2] POST /api/chat/ask")
try:
    chat_res = requests.post(
        f"{base}/api/chat/ask",
        json={"question": "what is java", "explanation_mode": "normal", "language": "English"},
        headers=headers,
        timeout=30
    )
    print(f"Status Code: {chat_res.status_code}")
    print(f"Response Body: {chat_res.text[:400]}")
except Exception as e:
    print(f"Request exception: {e}")
