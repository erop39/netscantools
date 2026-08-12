from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth as auth_router
from app.api import dashboard as dashboard_router
from app.api import devices as devices_router
from app.api import hygiene as hygiene_router
from app.api import inventory as inventory_router
from app.api import notifications as notifications_router
from app.api import planner as planner_router
from app.api import ports as ports_router
from app.api import scans as scans_router
from app.api import settings as settings_router
from app.config import get_settings
from app.db import Base, SessionLocal, engine, ensure_schema
from app import models  # noqa: F401 — register models
from app.services.auth import ensure_admin_user, ensure_default_settings
from app.services.scheduler import start_scheduler, stop_scheduler
from app.timeutil import install_utc_json_encoders, to_api_iso, utc_now

# API timestamps always UTC with Z so the browser maps them to the PC timezone
install_utc_json_encoders()

settings = get_settings()
app = FastAPI(title="netscantools", version="0.9.0-beta.1")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth_router.router)
app.include_router(devices_router.router)
app.include_router(dashboard_router.router)
app.include_router(scans_router.router)
app.include_router(notifications_router.router)
app.include_router(settings_router.router)
app.include_router(planner_router.router)
app.include_router(hygiene_router.router)
app.include_router(inventory_router.router)
app.include_router(ports_router.router)


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)
    ensure_schema()
    db = SessionLocal()
    try:
        ensure_admin_user(db)
        ensure_default_settings(db)
    finally:
        db.close()
    # Warm OUI cache in background — never block API boot on IEEE download
    import threading

    def _warm_oui() -> None:
        try:
            from app.services.oui import ensure_oui_db

            ensure_oui_db(allow_download=True)
        except Exception:
            pass

    threading.Thread(target=_warm_oui, name="oui-warm", daemon=True).start()
    start_scheduler()


@app.on_event("shutdown")
def on_shutdown() -> None:
    stop_scheduler()


@app.get("/api/health")
def health() -> dict[str, str]:
    now = utc_now()
    return {
        "status": "ok",
        "server_time_utc": to_api_iso(now) or "",
        "server_timezone": "UTC",
    }


@app.get("/api/time")
def server_time() -> dict[str, str]:
    """Server clock (UTC). Client compares with PC local time / timezone."""
    now = utc_now()
    return {
        "server_time_utc": to_api_iso(now) or "",
        "server_timezone": "UTC",
        "unix_ms": str(int(now.timestamp() * 1000)),
    }
