from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db import get_db
from app.models.scan import Scan
from app.models.user import User
from app.schemas.scan import ScanOut
from app.services.scanner import ScanAlreadyRunning, is_scan_locked, run_scan_job

router = APIRouter(prefix="/api/scans", tags=["scans"])


@router.post("", response_model=ScanOut, status_code=status.HTTP_202_ACCEPTED)
def start_scan(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Scan:
    if is_scan_locked():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Scan already running",
        )
    if db.query(Scan).filter(Scan.status == "running").first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Scan already running",
        )
    try:
        return run_scan_job(db)
    except ScanAlreadyRunning as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc) or "Scan already running",
        ) from exc


@router.get("", response_model=list[ScanOut])
def list_scans(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[Scan]:
    return db.query(Scan).order_by(Scan.started_at.desc()).all()


@router.get("/{scan_id}", response_model=ScanOut)
def get_scan(
    scan_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Scan:
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if scan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan not found")
    return scan
