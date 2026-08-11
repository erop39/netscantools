# NetInventory MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working NetInventory MVP on Windows: FastAPI + SQLite backend (auth, devices, scans, notifications, settings, dashboard) and React + Vite + Tailwind glass-sidebar UI matching `ui/` references.

**Architecture:** Monorepo. Backend owns SQLite, JWT cookie auth, Windows scanner (ping-sweep + `arp -a`), APScheduler. Frontend is a React SPA with Vite proxy `/api` → `:8000`. Versions land as 0.1.0 → 0.4.0; every version updates `docs/changelog.md`.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.x, APScheduler, bcrypt/passlib, PyJWT, React 18, Vite, Tailwind CSS 3, React Router 6, TypeScript.

**Spec:** `docs/superpowers/specs/2026-08-11-netinventory-mvp-design.md`

## Global Constraints

- Product brand: qube.li / NetInventory; UI palette base `#073e77`, glass sidebar (radius 34px, blur, white/12% border)
- MAC is stable device identity; normalize to lowercase `aa:bb:cc:dd:ee:ff`
- Auth: single user, JWT in httpOnly cookie named `netpad_token`
- Scanner MVP must work on Windows without scapy (ping + `arp -a`)
- Do not implement Inventory journal, multi-user, Docker prod hardening, VPN, email alerts
- Every released version **must** append to `docs/changelog.md`
- API prefix: `/api`
- Default bootstrap: `ADMIN_USER=admin`, `ADMIN_PASSWORD=admin` (from env)
- JWT secret from env `JWT_SECRET`
- DB path: `backend/data/netpad.db`
- TDD for backend logic (device diff, auth); frequent commits
- Work on Windows (PowerShell); use `.venv\Scripts\activate`, not bash source

---

## File map (create during plan)

```
backend/
  requirements.txt
  .env.example
  pytest.ini
  app/
    __init__.py
    main.py
    config.py
    db.py
    models/
      __init__.py
      user.py
      device.py
      scan.py
      notification.py
      setting.py
    schemas/
      __init__.py
      auth.py
      device.py
      scan.py
      notification.py
      settings.py
      dashboard.py
    api/
      __init__.py
      deps.py
      auth.py
      devices.py
      scans.py
      notifications.py
      settings.py
      dashboard.py
    services/
      __init__.py
      auth.py
      scanner.py
      device_diff.py
      scheduler.py
      oui.py
  tests/
    conftest.py
    test_auth.py
    test_device_diff.py
    test_devices_api.py
    test_scanner_parse.py
frontend/
  package.json
  vite.config.ts
  tailwind.config.js
  postcss.config.js
  index.html
  tsconfig.json
  tsconfig.app.json
  src/
    main.tsx
    App.tsx
    index.css
    api/client.ts
    types/index.ts
    components/layout/Sidebar.tsx
    components/layout/AppShell.tsx
    components/ProtectedRoute.tsx
    pages/Login.tsx
    pages/Home.tsx
    pages/Devices.tsx
    pages/DeviceDetail.tsx
    pages/Scans.tsx
    pages/Notifications.tsx
    pages/Settings.tsx
docs/changelog.md          # update each version
README.md                  # root pointer
```

---

### Task 1: Backend scaffold + config + DB session

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/.env.example`
- Create: `backend/pytest.ini`
- Create: `backend/app/__init__.py`
- Create: `backend/app/config.py`
- Create: `backend/app/db.py`
- Create: `backend/app/main.py`
- Create: `backend/tests/conftest.py`
- Create: `README.md`
- Modify: `docs/changelog.md`

**Interfaces:**
- Produces: `get_settings() -> Settings`, `SessionLocal`, `get_db()`, `app` FastAPI with CORS + `/api/health`

- [ ] **Step 1: Create backend dependency and config files**

`backend/requirements.txt`:
```
fastapi==0.115.6
uvicorn[standard]==0.34.0
sqlalchemy==2.0.36
pydantic-settings==2.7.0
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
bcrypt==4.0.1
httpx==0.28.1
pytest==8.3.4
apscheduler==3.10.4
python-multipart==0.0.20
```

`backend/.env.example`:
```
ADMIN_USER=admin
ADMIN_PASSWORD=admin
JWT_SECRET=change-me-to-a-long-random-string
JWT_EXPIRE_MINUTES=10080
DATABASE_URL=sqlite:///./data/netpad.db
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

`backend/pytest.ini`:
```ini
[pytest]
testpaths = tests
pythonpath = .
```

`backend/app/config.py`:
```python
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    admin_user: str = "admin"
    admin_password: str = "admin"
    jwt_secret: str = "dev-secret-change-me"
    jwt_expire_minutes: int = 60 * 24 * 7
    database_url: str = "sqlite:///./data/netpad.db"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

`backend/app/db.py`:
```python
from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


def _ensure_sqlite_dir(url: str) -> None:
    if url.startswith("sqlite:///./"):
        rel = url.removeprefix("sqlite:///./")
        Path(rel).parent.mkdir(parents=True, exist_ok=True)


settings = get_settings()
_ensure_sqlite_dir(settings.database_url)
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

`backend/app/main.py`:
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import Base, engine

settings = get_settings()
app = FastAPI(title="NetInventory", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

`backend/app/__init__.py`: empty

`backend/tests/conftest.py`:
```python
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client(db_session):
    def _override():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = _override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
```

`README.md` (root):
```markdown
# NetInventory (qube.li)

See [docs/README.md](docs/README.md) for product docs.

- Design: [docs/superpowers/specs/2026-08-11-netinventory-mvp-design.md](docs/superpowers/specs/2026-08-11-netinventory-mvp-design.md)
- Changelog: [docs/changelog.md](docs/changelog.md)
```

- [ ] **Step 2: Install deps and verify health**

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:JWT_SECRET="test"
uvicorn app.main:app --port 8000
```

In another shell: `Invoke-RestMethod http://127.0.0.1:8000/api/health`  
Expected: `status : ok`  
Stop uvicorn after check.

- [ ] **Step 3: Commit**

```powershell
git add backend README.md docs/changelog.md
git commit -m "chore: scaffold FastAPI backend config and health endpoint"
```

---

### Task 2: SQLAlchemy models + bootstrap admin user

**Files:**
- Create: `backend/app/models/__init__.py`
- Create: `backend/app/models/user.py`
- Create: `backend/app/models/device.py`
- Create: `backend/app/models/scan.py`
- Create: `backend/app/models/notification.py`
- Create: `backend/app/models/setting.py`
- Create: `backend/app/services/auth.py`
- Modify: `backend/app/main.py` (bootstrap admin + default settings on startup)

**Interfaces:**
- Produces: models `User`, `Device`, `Scan`, `Notification`, `Setting`
- Produces: `hash_password(str) -> str`, `verify_password(plain, hashed) -> bool`, `ensure_admin_user(db)`, `ensure_default_settings(db)`

- [ ] **Step 1: Implement models**

`backend/app/models/user.py`:
```python
from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
```

`backend/app/models/device.py`:
```python
from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    mac: Mapped[str] = mapped_column(String(17), unique=True, index=True)
    ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    vendor: Mapped[str | None] = mapped_column(String(128), nullable=True)
    hostname: Mapped[str | None] = mapped_column(String(255), nullable=True)
    type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="unknown")  # online|offline|unknown
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    web_ui_local: Mapped[str | None] = mapped_column(String(512), nullable=True)
    web_ui_external: Mapped[str | None] = mapped_column(String(512), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    first_seen: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
```

`backend/app/models/scan.py`:
```python
from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Scan(Base):
    __tablename__ = "scans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="running")  # running|success|failed
    subnet: Mapped[str] = mapped_column(String(64))
    devices_found: Mapped[int] = mapped_column(Integer, default=0)
    new_devices: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
```

`backend/app/models/notification.py`:
```python
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    type: Mapped[str] = mapped_column(String(32))  # new_device|device_offline|ip_changed
    device_id: Mapped[int | None] = mapped_column(ForeignKey("devices.id"), nullable=True)
    message: Mapped[str] = mapped_column(Text)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
```

`backend/app/models/setting.py`:
```python
from sqlalchemy import Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Setting(Base):
    __tablename__ = "settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    value: Mapped[str] = mapped_column(Text)
```

`backend/app/models/__init__.py`:
```python
from app.models.device import Device
from app.models.notification import Notification
from app.models.scan import Scan
from app.models.setting import Setting
from app.models.user import User

__all__ = ["User", "Device", "Scan", "Notification", "Setting"]
```

- [ ] **Step 2: Auth password helpers + bootstrap**

`backend/app/services/auth.py`:
```python
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.user import User
from app.models.setting import Setting

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
ALGORITHM = "HS256"
COOKIE_NAME = "netpad_token"

DEFAULT_SETTINGS = {
    "scan_subnet": "192.168.1.0/24",
    "scan_interval_minutes": "0",
    "scan_ports": "80,443,8080",
}


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(subject: str) -> str:
    settings = get_settings()
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    return jwt.encode(
        {"sub": subject, "exp": expire},
        settings.jwt_secret,
        algorithm=ALGORITHM,
    )


def decode_token(token: str) -> str | None:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
        sub = payload.get("sub")
        return str(sub) if sub else None
    except JWTError:
        return None


def ensure_admin_user(db: Session) -> None:
    settings = get_settings()
    user = db.query(User).filter(User.username == settings.admin_user).first()
    if user is None:
        db.add(
            User(
                username=settings.admin_user,
                password_hash=hash_password(settings.admin_password),
            )
        )
        db.commit()


def ensure_default_settings(db: Session) -> None:
    for key, value in DEFAULT_SETTINGS.items():
        row = db.query(Setting).filter(Setting.key == key).first()
        if row is None:
            db.add(Setting(key=key, value=value))
    db.commit()
```

Update `backend/app/main.py` startup:
```python
from app.db import Base, SessionLocal, engine
from app import models  # noqa: F401 — register models
from app.services.auth import ensure_admin_user, ensure_default_settings


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        ensure_admin_user(db)
        ensure_default_settings(db)
    finally:
        db.close()
```

- [ ] **Step 3: Commit**

```powershell
git add backend/app
git commit -m "feat: add SQLAlchemy models and admin bootstrap"
```

---

### Task 3: Auth API (login / logout / me) + tests

**Files:**
- Create: `backend/app/schemas/auth.py`
- Create: `backend/app/api/deps.py`
- Create: `backend/app/api/auth.py`
- Create: `backend/tests/test_auth.py`
- Modify: `backend/app/main.py` (include router)

**Interfaces:**
- Produces: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- Produces: `get_current_user(request, db) -> User`

- [ ] **Step 1: Write failing auth tests**

`backend/tests/test_auth.py`:
```python
def test_login_success(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin"})
    assert r.status_code == 200
    assert r.json()["username"] == "admin"
    assert "netpad_token" in r.cookies


def test_login_failure(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
    assert r.status_code == 401


def test_me_requires_auth(client):
    r = client.get("/api/auth/me")
    assert r.status_code == 401


def test_me_after_login(client):
    client.post("/api/auth/login", json={"username": "admin", "password": "admin"})
    r = client.get("/api/auth/me")
    assert r.status_code == 200
    assert r.json()["username"] == "admin"
```

Update `conftest.py` client fixture to call bootstrap before tests:
```python
from app.services.auth import ensure_admin_user, ensure_default_settings

@pytest.fixture()
def db_session():
    # ... existing engine setup ...
    session = TestingSessionLocal()
    ensure_admin_user(session)
    ensure_default_settings(session)
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)
```

- [ ] **Step 2: Run tests — expect FAIL (routes missing)**

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
pytest tests/test_auth.py -v
```
Expected: FAIL (404 or import errors)

- [ ] **Step 3: Implement auth API**

`backend/app/schemas/auth.py`:
```python
from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: int
    username: str

    model_config = {"from_attributes": True}
```

`backend/app/api/deps.py`:
```python
from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.user import User
from app.services.auth import COOKIE_NAME, decode_token


def get_current_user(
    db: Session = Depends(get_db),
    netpad_token: str | None = Cookie(default=None),
) -> User:
    if not netpad_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    username = decode_token(netpad_token)
    if not username:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user
```

`backend/app/api/auth.py`:
```python
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db import get_db
from app.models.user import User
from app.schemas.auth import LoginRequest, UserOut
from app.services.auth import COOKIE_NAME, create_access_token, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=UserOut)
def login(body: LoginRequest, response: Response, db: Session = Depends(get_db)) -> User:
    user = db.query(User).filter(User.username == body.username).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = create_access_token(user.username)
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        max_age=60 * 60 * 24 * 7,
        path="/",
    )
    return user


@router.post("/logout")
def logout(response: Response) -> dict[str, str]:
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"status": "ok"}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user
```

Register in `main.py`:
```python
from app.api import auth as auth_router
app.include_router(auth_router.router)
```

- [ ] **Step 4: Run tests — expect PASS**

```powershell
pytest tests/test_auth.py -v
```
Expected: all PASS

- [ ] **Step 5: Commit**

```powershell
git add backend
git commit -m "feat: add JWT cookie auth API"
```

---

### Task 4: Device diff service + unit tests

**Files:**
- Create: `backend/app/services/device_diff.py`
- Create: `backend/app/services/oui.py`
- Create: `backend/tests/test_device_diff.py`

**Interfaces:**
- Consumes: `Device`, `Notification`, Session
- Produces: `normalize_mac(mac: str) -> str`, `apply_scan_results(db, found: list[HostResult]) -> DiffResult`
- `HostResult` dataclass: `mac: str`, `ip: str`, `hostname: str | None`, `vendor: str | None`

- [ ] **Step 1: Write failing tests for diff logic**

`backend/tests/test_device_diff.py`:
```python
from app.models.device import Device
from app.services.device_diff import HostResult, apply_scan_results, normalize_mac


def test_normalize_mac():
    assert normalize_mac("AA-BB-CC-DD-EE-FF") == "aa:bb:cc:dd:ee:ff"


def test_new_device_creates_notification(db_session):
    result = apply_scan_results(
        db_session,
        [HostResult(mac="aa:bb:cc:dd:ee:01", ip="192.168.1.10", hostname=None, vendor="Acme")],
    )
    assert result.new_devices == 1
    assert result.devices_found == 1
    dev = db_session.query(Device).filter(Device.mac == "aa:bb:cc:dd:ee:01").one()
    assert dev.status == "online"
    assert dev.ip == "192.168.1.10"
    from app.models.notification import Notification
    n = db_session.query(Notification).filter(Notification.type == "new_device").one()
    assert n.device_id == dev.id


def test_ip_change_notification(db_session):
    apply_scan_results(
        db_session,
        [HostResult(mac="aa:bb:cc:dd:ee:02", ip="192.168.1.20", hostname=None, vendor=None)],
    )
    apply_scan_results(
        db_session,
        [HostResult(mac="aa:bb:cc:dd:ee:02", ip="192.168.1.21", hostname=None, vendor=None)],
    )
    from app.models.notification import Notification
    types = [n.type for n in db_session.query(Notification).all()]
    assert "ip_changed" in types
    dev = db_session.query(Device).filter(Device.mac == "aa:bb:cc:dd:ee:02").one()
    assert dev.ip == "192.168.1.21"


def test_missing_device_goes_offline(db_session):
    apply_scan_results(
        db_session,
        [HostResult(mac="aa:bb:cc:dd:ee:03", ip="192.168.1.30", hostname=None, vendor=None)],
    )
    apply_scan_results(db_session, [])
    dev = db_session.query(Device).filter(Device.mac == "aa:bb:cc:dd:ee:03").one()
    assert dev.status == "offline"
    from app.models.notification import Notification
    assert db_session.query(Notification).filter(Notification.type == "device_offline").count() == 1
```

- [ ] **Step 2: Run — expect FAIL**

```powershell
pytest tests/test_device_diff.py -v
```

- [ ] **Step 3: Implement**

`backend/app/services/oui.py`:
```python
# Minimal OUI stub; extend later with a fuller table if needed
OUI_TABLE: dict[str, str] = {
    "00:50:56": "VMware",
    "b8:27:eb": "Raspberry Pi",
    "dc:a6:32": "Raspberry Pi",
}


def lookup_vendor(mac: str) -> str | None:
    prefix = mac.lower().replace("-", ":")[:8]
    return OUI_TABLE.get(prefix)
```

`backend/app/services/device_diff.py`:
```python
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.device import Device
from app.models.notification import Notification
from app.services.oui import lookup_vendor


@dataclass
class HostResult:
    mac: str
    ip: str
    hostname: str | None = None
    vendor: str | None = None


@dataclass
class DiffResult:
    devices_found: int
    new_devices: int


def normalize_mac(mac: str) -> str:
    cleaned = mac.strip().lower().replace("-", ":")
    parts = cleaned.split(":")
    if len(parts) != 6:
        raise ValueError(f"Invalid MAC: {mac}")
    return ":".join(p.zfill(2) for p in parts)


def apply_scan_results(db: Session, found: list[HostResult]) -> DiffResult:
    now = datetime.now(timezone.utc)
    new_count = 0
    seen_macs: set[str] = set()

    for host in found:
        mac = normalize_mac(host.mac)
        seen_macs.add(mac)
        vendor = host.vendor or lookup_vendor(mac)
        device = db.query(Device).filter(Device.mac == mac).first()
        if device is None:
            device = Device(
                mac=mac,
                ip=host.ip,
                vendor=vendor,
                hostname=host.hostname,
                status="online",
                last_seen=now,
                first_seen=now,
                updated_at=now,
            )
            db.add(device)
            db.flush()
            db.add(
                Notification(
                    type="new_device",
                    device_id=device.id,
                    message=f"New device {mac} at {host.ip}",
                )
            )
            new_count += 1
        else:
            if device.ip and device.ip != host.ip:
                db.add(
                    Notification(
                        type="ip_changed",
                        device_id=device.id,
                        message=f"{mac} IP changed {device.ip} → {host.ip}",
                    )
                )
            device.ip = host.ip
            device.status = "online"
            device.last_seen = now
            device.updated_at = now
            if host.hostname:
                device.hostname = host.hostname
            if vendor and not device.vendor:
                device.vendor = vendor

    online_devices = db.query(Device).filter(Device.status == "online").all()
    for device in online_devices:
        if device.mac not in seen_macs:
            device.status = "offline"
            device.updated_at = now
            db.add(
                Notification(
                    type="device_offline",
                    device_id=device.id,
                    message=f"Device {device.mac} went offline",
                )
            )

    db.commit()
    return DiffResult(devices_found=len(seen_macs), new_devices=new_count)
```

- [ ] **Step 4: Run tests — PASS**

```powershell
pytest tests/test_device_diff.py tests/test_auth.py -v
```

- [ ] **Step 5: Commit**

```powershell
git add backend
git commit -m "feat: device scan diff and OUI stub"
```

---

### Task 5: Devices + Dashboard API

**Files:**
- Create: `backend/app/schemas/device.py`
- Create: `backend/app/schemas/dashboard.py`
- Create: `backend/app/api/devices.py`
- Create: `backend/app/api/dashboard.py`
- Create: `backend/tests/test_devices_api.py`
- Modify: `backend/app/main.py`

**Interfaces:**
- `GET/PATCH/DELETE /api/devices`, `GET /api/devices/{id}`
- `GET /api/dashboard` → `{ online_count, total_count, last_scan, recent_notifications }`

- [ ] **Step 1: Write API tests**

`backend/tests/test_devices_api.py`:
```python
from app.services.device_diff import HostResult, apply_scan_results


def _login(client):
    client.post("/api/auth/login", json={"username": "admin", "password": "admin"})


def test_list_devices_empty(client):
    _login(client)
    r = client.get("/api/devices")
    assert r.status_code == 200
    assert r.json() == []


def test_list_and_patch_device(client, db_session):
    apply_scan_results(
        db_session,
        [HostResult(mac="aa:bb:cc:dd:ee:10", ip="192.168.1.50", hostname="cam", vendor="X")],
    )
    _login(client)
    r = client.get("/api/devices")
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 1
    dev_id = items[0]["id"]
    r2 = client.patch(f"/api/devices/{dev_id}", json={"type": "camera", "notes": "porch", "web_ui_local": "http://192.168.1.50"})
    assert r2.status_code == 200
    assert r2.json()["type"] == "camera"
    assert r2.json()["web_ui_local"] == "http://192.168.1.50"


def test_dashboard(client, db_session):
    apply_scan_results(
        db_session,
        [HostResult(mac="aa:bb:cc:dd:ee:11", ip="192.168.1.51", hostname=None, vendor=None)],
    )
    _login(client)
    r = client.get("/api/dashboard")
    assert r.status_code == 200
    body = r.json()
    assert body["online_count"] == 1
    assert body["total_count"] == 1
```

- [ ] **Step 2: Implement schemas + routers**

`backend/app/schemas/device.py`:
```python
from datetime import datetime

from pydantic import BaseModel


class DeviceOut(BaseModel):
    id: int
    mac: str
    ip: str | None
    vendor: str | None
    hostname: str | None
    type: str | None
    status: str
    last_seen: datetime | None
    web_ui_local: str | None
    web_ui_external: str | None
    notes: str | None
    first_seen: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DeviceUpdate(BaseModel):
    type: str | None = None
    notes: str | None = None
    web_ui_local: str | None = None
    web_ui_external: str | None = None
```

`backend/app/schemas/dashboard.py`:
```python
from datetime import datetime

from pydantic import BaseModel


class LastScanOut(BaseModel):
    id: int
    status: str
    started_at: datetime
    finished_at: datetime | None
    devices_found: int
    new_devices: int
    subnet: str

    model_config = {"from_attributes": True}


class RecentNotificationOut(BaseModel):
    id: int
    type: str
    message: str
    read: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class DashboardOut(BaseModel):
    online_count: int
    total_count: int
    last_scan: LastScanOut | None
    recent_notifications: list[RecentNotificationOut]
```

`backend/app/api/devices.py`:
```python
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db import get_db
from app.models.device import Device
from app.models.user import User
from app.schemas.device import DeviceOut, DeviceUpdate

router = APIRouter(prefix="/api/devices", tags=["devices"])


@router.get("", response_model=list[DeviceOut])
def list_devices(
    status_filter: str | None = Query(default=None, alias="status"),
    q: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[Device]:
    query = db.query(Device)
    if status_filter:
        query = query.filter(Device.status == status_filter)
    if q:
        like = f"%{q}%"
        query = query.filter(
            (Device.mac.ilike(like))
            | (Device.ip.ilike(like))
            | (Device.hostname.ilike(like))
            | (Device.vendor.ilike(like))
            | (Device.notes.ilike(like))
        )
    return query.order_by(Device.last_seen.desc().nullslast()).all()


@router.get("/{device_id}", response_model=DeviceOut)
def get_device(
    device_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Device:
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


@router.patch("/{device_id}", response_model=DeviceOut)
def update_device(
    device_id: int,
    body: DeviceUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Device:
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(device, field, value)
    db.commit()
    db.refresh(device)
    return device


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_device(
    device_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> None:
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    db.delete(device)
    db.commit()
```

`backend/app/api/dashboard.py`:
```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db import get_db
from app.models.device import Device
from app.models.notification import Notification
from app.models.scan import Scan
from app.models.user import User
from app.schemas.dashboard import DashboardOut

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardOut)
def dashboard(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> DashboardOut:
    total = db.query(Device).count()
    online = db.query(Device).filter(Device.status == "online").count()
    last_scan = db.query(Scan).order_by(Scan.started_at.desc()).first()
    recent = (
        db.query(Notification).order_by(Notification.created_at.desc()).limit(10).all()
    )
    return DashboardOut(
        online_count=online,
        total_count=total,
        last_scan=last_scan,
        recent_notifications=recent,
    )
```

Register routers in `main.py`.

- [ ] **Step 3: pytest PASS + commit**

```powershell
pytest tests/ -v
git add backend
git commit -m "feat: devices and dashboard API"
```

---

### Task 6: Windows scanner + Scans API + scheduler

**Files:**
- Create: `backend/app/services/scanner.py`
- Create: `backend/app/services/scheduler.py`
- Create: `backend/app/schemas/scan.py`
- Create: `backend/app/api/scans.py`
- Create: `backend/tests/test_scanner_parse.py`
- Modify: `backend/app/main.py` (startup scheduler)

**Interfaces:**
- `parse_arp_a(output: str) -> dict[str, str]`  # ip -> mac
- `async run_scan(db) -> Scan` (or sync run in thread)
- `POST /api/scans` → 202 or 200 with scan; 409 if running
- `GET /api/scans`, `GET /api/scans/{id}`
- Scheduler reads `scan_interval_minutes` from settings

- [ ] **Step 1: Test ARP table parsing**

`backend/tests/test_scanner_parse.py`:
```python
from app.services.scanner import parse_arp_a

SAMPLE = """
Interface: 192.168.1.5 --- 0x5
  Internet Address      Physical Address      Type
  192.168.1.1           aa-bb-cc-dd-ee-01     dynamic
  192.168.1.10          11-22-33-44-55-66     dynamic
  192.168.1.255         ff-ff-ff-ff-ff-ff     static
"""


def test_parse_arp_a():
    mapping = parse_arp_a(SAMPLE)
    assert mapping["192.168.1.1"] == "aa:bb:cc:dd:ee:01"
    assert mapping["192.168.1.10"] == "11:22:33:44:55:66"
    assert "192.168.1.255" not in mapping
```

- [ ] **Step 2: Implement scanner**

`backend/app/services/scanner.py` — key behavior:
- `parse_arp_a`: regex for Windows `arp -a` lines; skip multicast/broadcast `ff:ff:...`
- `hosts_in_subnet(cidr) -> list[str]` via `ipaddress`
- `ping_host(ip) -> bool` using `subprocess` `ping -n 1 -w 500` on Windows
- `run_ping_sweep(subnet, concurrency=50)` thread pool
- `get_arp_table()` → `subprocess.run(["arp", "-a"], capture_output=True, text=True)`
- `run_scan_job(db: Session) -> Scan`:
  1. If any Scan.status == running → raise `ScanAlreadyRunning`
  2. Create Scan(running, subnet from settings)
  3. ping sweep
  4. parse arp
  5. build HostResult list for IPs that responded OR appear in ARP with dynamic entries in subnet
  6. `apply_scan_results`
  7. update scan success/failed

Include lock (`threading.Lock`) so concurrent POST returns 409.

`backend/app/schemas/scan.py`:
```python
from datetime import datetime
from pydantic import BaseModel

class ScanOut(BaseModel):
    id: int
    started_at: datetime
    finished_at: datetime | None
    status: str
    subnet: str
    devices_found: int
    new_devices: int
    error_message: str | None
    model_config = {"from_attributes": True}
```

`backend/app/api/scans.py`:
```python
# POST starts scan in BackgroundTasks or asyncio.to_thread
# GET list/detail auth required
```

`backend/app/services/scheduler.py`:
```python
from apscheduler.schedulers.background import BackgroundScheduler
# start/stop/reschedule based on scan_interval_minutes
# job calls SessionLocal + run_scan_job
```

On settings PUT (Task 8) call `reschedule()`. For now scheduler starts on app startup with current settings.

- [ ] **Step 3: pytest parse + manual scan smoke + commit**

```powershell
pytest tests/test_scanner_parse.py -v
git add backend
git commit -m "feat: Windows scanner, scans API, scheduler"
```

---

### Task 7: Notifications + Settings API

**Files:**
- Create: `backend/app/schemas/notification.py`
- Create: `backend/app/schemas/settings.py`
- Create: `backend/app/api/notifications.py`
- Create: `backend/app/api/settings.py`
- Modify: `backend/app/main.py`
- Modify: `backend/app/services/scheduler.py` (reschedule on settings update)

**Interfaces:**
- `GET /api/notifications`, `PATCH /api/notifications/{id}/read`, `POST /api/notifications/read-all`
- `GET /api/settings` → `{ scan_subnet, scan_interval_minutes: int, scan_ports }`
- `PUT /api/settings` same body; validates CIDR; reschedules job

- [ ] **Step 1: Implement routers + simple tests via TestClient**

Settings validation: `ipaddress.ip_network(subnet, strict=False)`; interval >= 0; ports comma-separated integers.

- [ ] **Step 2: Full backend pytest suite PASS**

```powershell
pytest tests/ -v
```

- [ ] **Step 3: Bump app version string if desired; commit**

```powershell
git add backend
git commit -m "feat: notifications and settings API"
```

---

### Task 8: Frontend scaffold + glass Sidebar + Login (v0.1.0 UI shell)

**Files:**
- Create entire `frontend/` via Vite template then edit
- Create layout components and Login page
- Modify: `docs/changelog.md` → release **0.1.0** notes (backend scaffold+auth+models + UI shell)

**Interfaces:**
- `api/client.ts`: `apiFetch(path, options)` with `credentials: "include"`
- Vite proxy: `'/api' -> 'http://127.0.0.1:8000'`

- [ ] **Step 1: Scaffold Vite React TS**

```powershell
cd D:\vibecoding\netPad
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install react-router-dom
npm install -D tailwindcss@3 postcss autoprefixer
npx tailwindcss init -p
```

`tailwind.config.js` content paths: `./index.html`, `./src/**/*.{js,ts,jsx,tsx}`  
`src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg: #073e77;
  --glass-bg: rgb(0 0 0 / 12%);
  --glass-border: rgb(255 255 255 / 12%);
}
body {
  margin: 0;
  min-height: 100vh;
  background-color: var(--bg);
  color: rgb(255 255 255 / 95%);
  font-family: system-ui, sans-serif;
}
```

`vite.config.ts`:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 2: API client + types + auth pages**

`src/api/client.ts`:
```ts
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(path, { ...options, headers, credentials: "include" });
  if (!res.ok) {
    const text = await res.text();
    throw new ApiError(res.status, text || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
```

`Sidebar.tsx` visual requirements (match `ui/`):
- `fixed top-6 left-6 bottom-11 w-[260px] rounded-[34px] border-[3px] border-white/12 bg-black/12 backdrop-blur-[30px] p-4 flex flex-col gap-2`
- header: brand text `qube.li`, subtitle NetInventory
- nav links: Home, Devices, Scans, Notifications, Settings
- active: `bg-white/10`, hover: `bg-white/3`, item height ~50px rounded-md
- logout button at bottom

`Login.tsx`: form posts `/api/auth/login`, on success navigate `/`  
`ProtectedRoute`: GET `/api/auth/me`, if 401 redirect `/login`  
`App.tsx`: routes as in design

- [ ] **Step 3: Visual smoke**

```powershell
# terminal 1
cd backend; .\.venv\Scripts\Activate.ps1; uvicorn app.main:app --reload --port 8000
# terminal 2
cd frontend; npm run dev
```

Open http://127.0.0.1:5173 — login admin/admin — sidebar glass visible.

- [ ] **Step 4: Changelog 0.1.0 + commit**

Append to `docs/changelog.md`:
```markdown
## [0.1.0] — 2026-08-11

### Added
- FastAPI backend scaffold, SQLite models, admin bootstrap
- JWT cookie auth (login / logout / me)
- React + Vite + Tailwind frontend shell
- Glass sidebar UI (qube.li style from ui/ references)
- Login and protected routing
```

```powershell
git add frontend backend docs/changelog.md
git commit -m "feat: v0.1.0 UI shell, auth, and backend foundation"
```

---

### Task 9: Devices + Home dashboard UI (v0.2.0)

**Files:**
- Create/modify: `frontend/src/pages/Home.tsx`, `Devices.tsx`, `DeviceDetail.tsx`
- Modify: `docs/changelog.md`

- [ ] **Step 1: Home page** — fetch `/api/dashboard`; cards for online/total; last scan; recent notifications list
- [ ] **Step 2: Devices page** — table: status badge, IP, MAC, hostname, vendor, type; buttons open `web_ui_local` / `web_ui_external` in new tab; link to detail
- [ ] **Step 3: Device detail** — form PATCH type, notes, web_ui_*; DELETE with confirm
- [ ] **Step 4: Changelog 0.2.0 + commit**

```markdown
## [0.2.0] — YYYY-MM-DD
### Added
- Devices list/detail with edit web UI links
- Home dashboard (online count, last scan, recent activity)
```

```powershell
git commit -m "feat: v0.2.0 devices and dashboard UI"
```

---

### Task 10: Scans UI + live scan status (v0.3.0)

**Files:**
- Modify: `frontend/src/pages/Scans.tsx`
- Optionally poll GET `/api/scans` while status running

- [ ] **Step 1: Scans page** — Start Scan button → POST `/api/scans`; handle 409 toast; history table
- [ ] **Step 2: Manual test** on real LAN subnet (user machine); if no other hosts, at least gateway may appear after ping+arp
- [ ] **Step 3: Changelog 0.3.0 + commit**

```markdown
## [0.3.0]
### Added
- Windows network scanner (ping sweep + arp -a)
- Scans API, history UI, manual trigger
- APScheduler interval scans
```

---

### Task 11: Notifications + Settings UI + MVP polish (v0.4.0)

**Files:**
- Modify: `Notifications.tsx`, `Settings.tsx`
- Modify: `Sidebar` badge for unread count (optional GET notifications filter)
- Modify: `docs/changelog.md`, `docs/README.md` (mark MVP roadmap items done)
- Create: `backend/.env` is gitignored — ensure `.gitignore`

- [ ] **Step 1: Create `.gitignore`**

```
backend/.venv/
backend/data/
backend/.env
frontend/node_modules/
frontend/dist/
__pycache__/
*.pyc
.pytest_cache/
```

- [ ] **Step 2: Notifications page** — list, mark read, mark all read
- [ ] **Step 3: Settings page** — form subnet, interval minutes, ports; PUT; show success
- [ ] **Step 4: Empty states, loading spinners, error banners consistency**
- [ ] **Step 5: Full manual checklist**
  1. Login
  2. Settings set real subnet
  3. Run scan
  4. Devices appear
  5. Edit notes / web UI
  6. Notifications for new device
  7. Logout / login
- [ ] **Step 6: Changelog 0.4.0 + README roadmap checkboxes + commit**

```markdown
## [0.4.0]
### Added
- Notifications UI
- Settings UI (subnet, interval, ports)
### Changed
- MVP feature set complete per design spec
```

```powershell
git add -A
git commit -m "feat: v0.4.0 notifications, settings, MVP polish"
```

---

### Task 12: Verification suite

- [ ] **Step 1: Backend tests**

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
pytest tests/ -v
```
Expected: all green

- [ ] **Step 2: Frontend build**

```powershell
cd frontend
npm run build
```
Expected: success, no TS errors

- [ ] **Step 3: Confirm changelog has 0.1.0–0.4.0 entries and Unreleased cleaned**

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|---|---|
| FastAPI + SQLite + models | 1–2 |
| JWT cookie auth | 3 |
| Devices CRUD + web UI fields | 5, 9 |
| Dashboard | 5, 9 |
| Windows scanner ping+arp | 6, 10 |
| Scans history + manual | 6, 10 |
| APScheduler | 6 |
| Notifications | 7, 11 |
| Settings | 7, 11 |
| Glass sidebar UI | 8 |
| Pages: Home/Devices/Scans/Notifications/Settings/Login | 8–11 |
| changelog per version | 8–11 |
| Out of scope Inventory/multi-user/Docker/VPN | not planned |

No TBD placeholders in task code. Types: `HostResult`, `DiffResult`, `DeviceOut`, cookie `netpad_token` consistent across tasks.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-11-netinventory-mvp.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute tasks in this session with checkpoints  

Which approach?
