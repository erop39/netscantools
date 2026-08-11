from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db import get_db
from app.models.user import User
from app.schemas.planner import PlanOut
from app.services import planner as svc

router = APIRouter(prefix="/api/planner", tags=["planner"])


@router.get("", response_model=PlanOut)
def get_plan(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> PlanOut:
    plan = svc.ensure_plan(db)
    return svc.plan_to_out(db, plan)
