from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth as auth_router
from app.api import dashboard as dashboard_router
from app.api import devices as devices_router
from app.api import scans as scans_router
from app.config import get_settings
from app.db import Base, SessionLocal, engine
from app import models  # noqa: F401 — register models
from app.services.auth import ensure_admin_user, ensure_default_settings
from app.services.scheduler import start_scheduler, stop_scheduler

settings = get_settings()
app = FastAPI(title="NetInventory", version="0.1.0")
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


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        ensure_admin_user(db)
        ensure_default_settings(db)
    finally:
        db.close()
    start_scheduler()


@app.on_event("shutdown")
def on_shutdown() -> None:
    stop_scheduler()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
