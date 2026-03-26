
import os
import sys
import json
import datetime
import functools
import shutil
import threading
import time
import tempfile
import traceback
import webbrowser
from flask import Flask, send_from_directory, jsonify, request

app = Flask(__name__)

# ---------------------------------------------------------------------------------
# API-key guard for write endpoints
# ---------------------------------------------------------------------------------
PLAN_API_KEY = os.environ.get("PLAN_API_KEY", "")

def require_api_key(f):
    """Decorator: rejects requests that don't provide the correct X-API-Key header."""
    @functools.wraps(f)
    def wrapper(*args, **kwargs):
        if not PLAN_API_KEY:
            # Key not configured — deny all writes to force explicit setup
            return jsonify(error="Server misconfiguration: PLAN_API_KEY is not set"), 500
        if request.headers.get("X-API-Key") != PLAN_API_KEY:
            return jsonify(error="Unauthorized"), 401
        return f(*args, **kwargs)
    return wrapper

# ---------------------------------------------------------------------------------
# Front-end location (index.html + optional /static assets)
# ---------------------------------------------------------------------------------
if getattr(sys, "frozen", False):
    APP_ROOT = os.path.dirname(sys.executable)
    WEB_DIR = getattr(sys, "_MEIPASS", APP_ROOT)
else:
    APP_ROOT = os.path.dirname(os.path.abspath(__file__))
    WEB_DIR = APP_ROOT

# ---------------------------------------------------------------------------------
# Shared data directory — use the mapped drive G:\...
# (User asked: "not use server host, just the database in server folder G:\...")
# You can override by setting env MACHINE_SCHEDULER_DATA_DIR to any folder.
# ---------------------------------------------------------------------------------
DEFAULT_G_PATH = r"G:\02_Folder 5S\FF === Group ===\05_HUB\16_Program\Machine booking"
DATA_DIR = os.environ.get("MACHINE_SCHEDULER_DATA_DIR", DEFAULT_G_PATH)

# Try to create the directory (if permissions allow); otherwise proceed.
try:
    os.makedirs(DATA_DIR, exist_ok=True)
except Exception:
    pass

DATA_PATH = os.path.join(DATA_DIR, "schedule.json")
LOG_PATH  = os.path.join(DATA_DIR, "error.log")
LOCK_PATH = os.path.join(DATA_DIR, "schedule.lock")

# ---------------------------------------------------------------------------------
# Logging helper
# ---------------------------------------------------------------------------------
def log_exc(e, ctx=""):
    try:
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            ts = datetime.datetime.utcnow().isoformat()
            f.write(f"[{ts}] {ctx} {repr(e)}\n")
            f.write(traceback.format_exc() + "\n")
    except Exception:
        pass

# ---------------------------------------------------------------------------------
# Interprocess file lock (serializes writers on SMB/UNC)
# ---------------------------------------------------------------------------------
class FileLock:
    def __init__(self, path):
        self.path = path
        self.f = None
    def acquire(self, timeout=10.0, poll=0.1):
        start = time.time()
        self.f = open(self.path, "a+")
        while True:
            try:
                if os.name == "nt":
                    import msvcrt
                    msvcrt.locking(self.f.fileno(), msvcrt.LK_NBLCK, 1)  # lock 1 byte
                else:
                    import fcntl
                    fcntl.flock(self.f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                return
            except Exception:
                if (time.time() - start) > timeout:
                    raise TimeoutError("Could not acquire file lock")
                time.sleep(poll)
    def release(self):
        if not self.f:
            return
        try:
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(self.f.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.f.fileno(), fcntl.LOCK_UN)
        except Exception as e:
            log_exc(e, "FileLock.release")
        try:
            self.f.close()
        except Exception:
            pass
        self.f = None
    def __enter__(self):
        self.acquire()
        return self
    def __exit__(self, exc_type, exc, tb):
        self.release()

# ---------------------------------------------------------------------------------
# Atomic write helper (safe under concurrent writers)
# ---------------------------------------------------------------------------------
def safe_write_json(path: str, content: dict):
    d = os.path.dirname(path)
    fd, tmp = tempfile.mkstemp(dir=d, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(content, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)  # atomic on same filesystem
    except Exception as e:
        log_exc(e, "safe_write_json")
        try:
            if os.path.exists(tmp):
                os.remove(tmp)
        except Exception:
            pass
        raise

# ---------------------------------------------------------------------------------
# Default seed data
# ---------------------------------------------------------------------------------
DEFAULT_MACHINES = [
    {"id": "semi_floating", "name": "Semi-floating"},
    {"id": "mud_slurry",    "name": "Mud slurry"},
    {"id": "four_five_ton", "name": "4-5 ton"},
    {"id": "dual_long",     "name": "Dual long"},
]
def ensure_seed():
    if not os.path.exists(DATA_PATH):
        try:
            content = {
                "updated_at": None,
                "machines": DEFAULT_MACHINES,
                "tasks": []
            }
            with FileLock(LOCK_PATH):
                safe_write_json(DATA_PATH, content)
        except Exception as e:
            log_exc(e, "ensure_seed")

# ---------------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------------
@app.route("/")
def root():
    return send_from_directory(WEB_DIR, "index.html")

@app.route("/<path:path>")
def static_proxy(path):
    return send_from_directory(WEB_DIR, path)

@app.route("/plan-hub-api/schedule", methods=["GET"])
def get_schedule():
    try:
        ensure_seed()
        with open(DATA_PATH, "r", encoding="utf-8") as f:
            content = json.load(f)
        return jsonify(content)
    except Exception as e:
        log_exc(e, "get_schedule")
        return jsonify({
            "ok": False,
            "error": str(e),
            "updated_at": None,
            "machines": DEFAULT_MACHINES,
            "tasks": []
        }), 200

@app.route("/plan-hub-api/auth-check", methods=["GET"])
@require_api_key
def auth_check():
    return jsonify(ok=True)

@app.route("/plan-hub-api/schedule", methods=["POST"])
@require_api_key
def save_schedule():
    try:
        data = request.get_json(force=True) or {}
        # Holidays are visual-only; back-end does not block by holiday
        content = {
            "machines": data.get("machines", []),
            "tasks":    data.get("tasks", []),
            "holidays": data.get("holidays", []),  # <--- ADD THIS LINE
            "updated_at": datetime.datetime.utcnow().isoformat()
        }
        with FileLock(LOCK_PATH):
            # Keep one-step backup of the previous schedule to prevent accidental wipes.
            try:
                if os.path.exists(DATA_PATH):
                    shutil.copy2(DATA_PATH, DATA_PATH + ".bak")
            except Exception as e:
                log_exc(e, "save_schedule.backup")
            safe_write_json(DATA_PATH, content)
        return jsonify(ok=True, **content)
    except Exception as e:
        log_exc(e, "save_schedule")
        return jsonify(ok=False, error=str(e)), 500

@app.route("/health", methods=["GET"])
def health():
    return jsonify(ok=True, time=datetime.datetime.utcnow().isoformat(), data_dir=DATA_DIR)

# ---------------------------------------------------------------------------------
# Auto-open browser on start (local-only)
# ---------------------------------------------------------------------------------
def open_browser(url):
    time.sleep(0.8)
    try:
        webbrowser.open(url)
    except Exception as e:
        log_exc(e, "open_browser")

if __name__ == "__main__":
    PORT = int(os.environ.get("PORT", "8000"))
    app.run(host="0.0.0.0", port=PORT)
