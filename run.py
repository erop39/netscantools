#!/usr/bin/env python3
"""
NetInventory single launcher — starts API + UI in one process/window.

Usage:
  python run.py
  python run.py --no-browser
  python run.py --api-port 8001

Ctrl+C stops both servers.
"""

from __future__ import annotations

import argparse
import os
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
IS_WIN = sys.platform == "win32"


def c(text: str, color: str) -> str:
    if not sys.stdout.isatty():
        return text
    codes = {
        "cyan": "\033[36m",
        "magenta": "\033[35m",
        "green": "\033[32m",
        "yellow": "\033[33m",
        "red": "\033[31m",
        "dim": "\033[2m",
        "reset": "\033[0m",
        "bold": "\033[1m",
    }
    return f"{codes.get(color, '')}{text}{codes['reset']}"


def log(tag: str, msg: str, color: str = "dim") -> None:
    print(f"{c(f'[{tag}]', color)} {msg}", flush=True)


def port_free(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind((host, port))
            return True
        except OSError:
            return False


def pick_port(preferred: int, host: str = "127.0.0.1") -> int:
    if port_free(host, preferred):
        return preferred
    for p in range(preferred + 1, preferred + 30):
        if port_free(host, p):
            return p
    raise RuntimeError(f"No free port near {preferred}")


def venv_python() -> Path:
    if IS_WIN:
        return BACKEND / ".venv" / "Scripts" / "python.exe"
    return BACKEND / ".venv" / "bin" / "python"


def ensure_backend() -> Path:
    py = venv_python()
    if not py.is_file():
        log("setup", "Creating Python venv…", "yellow")
        subprocess.check_call([sys.executable, "-m", "venv", str(BACKEND / ".venv")])
    req = BACKEND / "requirements.txt"
    marker = BACKEND / ".venv" / ".deps_ok"
    need_install = not marker.is_file()
    if need_install or req.stat().st_mtime > marker.stat().st_mtime:
        log("setup", "Installing backend dependencies…", "yellow")
        subprocess.check_call([str(py), "-m", "pip", "install", "-q", "-r", str(req)])
        marker.write_text("ok", encoding="utf-8")
    return py


def ensure_frontend() -> None:
    node_modules = FRONTEND / "node_modules"
    if not node_modules.is_dir():
        npm = shutil.which("npm")
        if not npm:
            raise RuntimeError("npm not found — install Node.js from https://nodejs.org")
        log("setup", "Installing frontend dependencies (npm install)…", "yellow")
        subprocess.check_call([npm, "install"], cwd=str(FRONTEND), shell=IS_WIN)


def pipe_output(proc: subprocess.Popen[str], tag: str, color: str) -> None:
    assert proc.stdout is not None
    for line in proc.stdout:
        print(f"{c(f'[{tag}]', color)} {line.rstrip()}", flush=True)


def wait_http(url: str, timeout: float = 60.0) -> bool:
    import urllib.error
    import urllib.request

    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1.5) as r:
                if 200 <= r.status < 500:
                    return True
        except (urllib.error.URLError, TimeoutError, OSError):
            time.sleep(0.4)
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description="Start NetInventory (API + UI) in one window")
    parser.add_argument("--api-port", type=int, default=8000)
    parser.add_argument("--ui-port", type=int, default=5173)
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--skip-install", action="store_true", help="Do not auto-install deps")
    args = parser.parse_args()

    print()
    print(c("  NetInventory (qube.li)", "bold"))
    print(c("  Single launcher — API + UI", "dim"))
    print()

    if not BACKEND.is_dir() or not FRONTEND.is_dir():
        print(c("ERROR: run from repo root (backend/ and frontend/ must exist)", "red"))
        return 1

    if not args.skip_install:
        try:
            py = ensure_backend()
            ensure_frontend()
        except (subprocess.CalledProcessError, RuntimeError) as exc:
            print(c(f"Setup failed: {exc}", "red"))
            return 1
    else:
        py = venv_python()
        if not py.is_file():
            print(c("No venv — run without --skip-install first", "red"))
            return 1

    api_port = pick_port(args.api_port)
    ui_port = pick_port(args.ui_port)
    if api_port != args.api_port:
        log("setup", f"Port {args.api_port} busy → API on {api_port}", "yellow")
    if ui_port != args.ui_port:
        log("setup", f"Port {args.ui_port} busy → UI on {ui_port}", "yellow")

    api_url = f"http://127.0.0.1:{api_port}"
    ui_url = f"http://127.0.0.1:{ui_port}"

    # Backend
    backend_cmd = [
        str(py),
        "-m",
        "uvicorn",
        "app.main:app",
        "--host",
        "127.0.0.1",
        "--port",
        str(api_port),
        "--reload",
    ]
    # Frontend — proxy /api to chosen API port
    npm = shutil.which("npm.cmd") if IS_WIN else shutil.which("npm")
    if not npm:
        npm = shutil.which("npm")
    if not npm:
        print(c("npm not found — install Node.js", "red"))
        return 1

    frontend_env = os.environ.copy()
    frontend_env["NETPAD_API_URL"] = api_url
    frontend_cmd = [
        npm,
        "run",
        "dev",
        "--",
        "--host",
        "127.0.0.1",
        "--port",
        str(ui_port),
        "--strictPort",
    ]

    procs: list[subprocess.Popen[str]] = []
    threads: list[threading.Thread] = []

    def start(cmd: list[str], cwd: Path, tag: str, color: str, env: dict | None = None) -> subprocess.Popen[str]:
        log("run", f"Starting {tag}: {' '.join(cmd)}", color)
        p = subprocess.Popen(
            cmd,
            cwd=str(cwd),
            env=env or os.environ.copy(),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
        )
        t = threading.Thread(target=pipe_output, args=(p, tag, color), daemon=True)
        t.start()
        threads.append(t)
        procs.append(p)
        return p

    try:
        start(backend_cmd, BACKEND, "api", "cyan")
        start(frontend_cmd, FRONTEND, "ui", "magenta", env=frontend_env)
    except OSError as exc:
        print(c(f"Failed to start: {exc}", "red"))
        return 1

    log("run", f"Waiting for API {api_url}/api/health …", "dim")
    if wait_http(f"{api_url}/api/health", timeout=45):
        log("run", "API is up", "green")
    else:
        log("run", "API did not respond in time (still starting?)", "yellow")

    log("run", f"Waiting for UI {ui_url} …", "dim")
    if wait_http(ui_url, timeout=45):
        log("run", "UI is up", "green")
    else:
        log("run", "UI did not respond in time", "yellow")

    print()
    print(c("  ─────────────────────────────────────", "dim"))
    print(c(f"  Open UI:  {ui_url}", "green"))
    print(c(f"  API:      {api_url}", "cyan"))
    print(c(f"  Login:    admin / admin", "dim"))
    print(c("  Stop:     Ctrl+C", "dim"))
    print(c("  ─────────────────────────────────────", "dim"))
    print()

    if not args.no_browser:
        try:
            webbrowser.open(ui_url)
        except Exception:
            pass

    stopping = False

    def kill_tree(pid: int) -> None:
        if IS_WIN:
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(pid)],
                capture_output=True,
                check=False,
            )
        else:
            try:
                os.killpg(os.getpgid(pid), signal.SIGTERM)
            except Exception:
                try:
                    os.kill(pid, signal.SIGTERM)
                except Exception:
                    pass

    def shutdown(*_args: object) -> None:
        nonlocal stopping
        if stopping:
            return
        stopping = True
        print()
        log("run", "Stopping…", "yellow")
        for p in procs:
            if p.poll() is None:
                kill_tree(p.pid)
        time.sleep(0.4)
        for p in procs:
            if p.poll() is None:
                try:
                    p.kill()
                except Exception:
                    pass

    if IS_WIN:
        signal.signal(signal.SIGINT, shutdown)
        signal.signal(signal.SIGTERM, shutdown)
    else:
        signal.signal(signal.SIGINT, shutdown)
        signal.signal(signal.SIGTERM, shutdown)

    try:
        while True:
            for p in procs:
                code = p.poll()
                if code is not None:
                    log("run", f"Process exited with code {code}", "red")
                    shutdown()
                    return code or 1
            time.sleep(0.3)
    except KeyboardInterrupt:
        shutdown()
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
