"""Test /api/chat/ask on the newly deployed service."""
import requests
import json

base = "https://rag-project-2-0.onrender.com"

# Login
user = {"email": "test_after_deploy@example.com", "password": "Password123!", "name": "Tester"}
requests.post(f"{base}/api/auth/register", json=user, timeout=10)
log_res = requests.post(f"{base}/api/auth/login", json={"email": user["email"], "password": user["password"]}, timeout=10)
token = log_res.json().get('data', {}).get('access_token')

headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
print("Calling /api/chat/ask...")
res = requests.post(f"{base}/api/chat/ask", json={"question": "what is java"}, headers=headers, timeout=30)
print(f"Status Code: {res.status_code}")
print(f"Response: {res.text[:400]}")
