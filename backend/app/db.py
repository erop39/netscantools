from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine, text
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


def ensure_schema() -> None:
    """Lightweight migrations for existing SQLite DBs (create_all won't add columns)."""
    if not settings.database_url.startswith("sqlite"):
        return
    with engine.begin() as conn:
        rows = conn.execute(text("PRAGMA table_info(devices)")).fetchall()
        if rows:
            col_names = {row[1] for row in rows}
            if "name" not in col_names:
                conn.execute(text("ALTER TABLE devices ADD COLUMN name VARCHAR(255)"))
            if "icon" not in col_names:
                conn.execute(text("ALTER TABLE devices ADD COLUMN icon VARCHAR(64)"))
            for col, ddl in [
                ("latency_ms", "ALTER TABLE devices ADD COLUMN latency_ms FLOAT"),
                ("open_ports", "ALTER TABLE devices ADD COLUMN open_ports JSON"),
                ("ports_scanned_at", "ALTER TABLE devices ADD COLUMN ports_scanned_at DATETIME"),
                ("security_score", "ALTER TABLE devices ADD COLUMN security_score INTEGER"),
                ("smb_shares", "ALTER TABLE devices ADD COLUMN smb_shares JSON"),
                ("smb_scanned_at", "ALTER TABLE devices ADD COLUMN smb_scanned_at DATETIME"),
                ("smb_scan_status", "ALTER TABLE devices ADD COLUMN smb_scan_status VARCHAR(32)"),
                ("location", "ALTER TABLE devices ADD COLUMN location VARCHAR(128)"),
                ("tls_status", "ALTER TABLE devices ADD COLUMN tls_status VARCHAR(32)"),
                ("tls_expires_at", "ALTER TABLE devices ADD COLUMN tls_expires_at DATETIME"),
                ("tls_issuer", "ALTER TABLE devices ADD COLUMN tls_issuer VARCHAR(255)"),
                ("tls_checked_at", "ALTER TABLE devices ADD COLUMN tls_checked_at DATETIME"),
                ("tls_error", "ALTER TABLE devices ADD COLUMN tls_error VARCHAR(255)"),
                ("is_person", "ALTER TABLE devices ADD COLUMN is_person BOOLEAN DEFAULT 0"),
            ]:
                if col not in col_names:
                    conn.execute(text(ddl))

        scan_rows = conn.execute(text("PRAGMA table_info(scans)")).fetchall()
        if scan_rows:
            scan_cols = {row[1] for row in scan_rows}
            if "mode" not in scan_cols:
                conn.execute(
                    text("ALTER TABLE scans ADD COLUMN mode VARCHAR(16) DEFAULT 'full'")
                )
