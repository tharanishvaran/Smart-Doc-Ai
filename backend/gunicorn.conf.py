import os

port = os.getenv("PORT", "10000")
bind = f"0.0.0.0:{port}"
workers = 1
threads = 2
timeout = 120
accesslog = "-"
errorlog = "-"
capture_output = True
