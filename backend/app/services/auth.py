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
    "quick_ports": "22,80,443,445,3389,8080,8443",
    # UI appearance: default | solid | gradient | custom
    "ui_background": "default",
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
