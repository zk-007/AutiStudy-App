"""Launcher that runs the AutiStudy API under pythonw.exe.

Why this file exists
--------------------
On Windows, when the API is started via ``python.exe -m uvicorn ...`` from
a hidden console, the Intel/MKL Fortran runtime aborts the process the
moment that hidden console window receives a CLOSE event::

    forrtl: error (200): program aborting due to window-CLOSE event

This happens whenever the parent shell or terminal that spawned the
python process exits — which makes the API impossible to keep running in
the background between Cursor shell calls.

The fix is to run the server under ``pythonw.exe``. ``pythonw`` has *no
console attached at all*, so there is no window that can ever generate a
CLOSE event. We just have to redirect stdout/stderr ourselves (pythonw
otherwise discards them) so we keep useful logs.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOG_DIR = ROOT / "logs"
LOG_DIR.mkdir(exist_ok=True)

stdout_path = LOG_DIR / "api.out.log"
stderr_path = LOG_DIR / "api.err.log"

sys.stdout = open(stdout_path, "a", buffering=1, encoding="utf-8", errors="replace")
sys.stderr = open(stderr_path, "a", buffering=1, encoding="utf-8", errors="replace")

os.chdir(ROOT)
# Make ``api_server`` importable. Uvicorn uses sys.path, not cwd.
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
os.environ.setdefault("PYTHONIOENCODING", "utf-8")

print(f"[run_api_detached] starting API; pid={os.getpid()}", flush=True)

import uvicorn  # noqa: E402  (import after stdio swap)

uvicorn.run(
    "api_server:app",
    host="127.0.0.1",
    port=8000,
    log_level="info",
    reload=False,
)
