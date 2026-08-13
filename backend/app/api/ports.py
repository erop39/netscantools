"""Well-known TCP port catalog (read-only; selection stays in settings CSV)."""

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_current_user
from app.models.user import User
from app.services import well_known_ports as wkp

router = APIRouter(prefix="/api/ports", tags=["ports"])


@router.get("/well-known")
def list_well_known_ports(
    category: str | None = Query(default=None),
    _: User = Depends(get_current_user),
) -> dict:
    rows = wkp.list_well_known(category=category)
    return {
        "categories": wkp.categories(),
        "ports": rows,
        "default_enabled": wkp.default_enabled_ports(),
        "presets": {
            "minimal": [22, 80, 443],
            "home_lan": [22, 80, 443, 445, 3389, 8080, 8443],
            "self_hosted": [22, 80, 443, 3000, 8123, 8096, 9000, 9443, 32400],
        },
    }
