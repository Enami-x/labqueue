"""
app/api/profiles.py – Profile endpoints.
"""

from __future__ import annotations

import json
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ValidationError
from sqlmodel import Session, select

from app.api.errors import error_item, pydantic_errors, raise_422
from app.db import ProfileRecord, get_session
from engine.model import BankerMode, PlacementKind, SchedulerKind
from engine.profiles import (
    BASE_PROFILES, Profile, all_profiles, filter_profiles
)

router = APIRouter(prefix="/api/profiles", tags=["profiles"])


# ---------------------------------------------------------------------------
# Lookup helpers shared by the runs, calendar and live endpoints
# ---------------------------------------------------------------------------

def custom_profiles(session: Session) -> List[tuple]:
    """(Profile, record_id) for every custom profile stored in the DB."""
    out = []
    for rec in session.exec(select(ProfileRecord).where(ProfileRecord.is_custom == True)).all():
        try:
            out.append((Profile.from_json(rec.data), rec.id))
        except Exception:
            pass
    return out


def resolve_profile(name: str, session: Session) -> Optional[Profile]:
    """Find a built-in (base or variant) or custom profile by exact name."""
    for p in all_profiles():
        if p.name == name:
            return p
    for p, _ in custom_profiles(session):
        if p.name == name:
            return p
    return None


def known_profile_names(session: Session) -> set:
    return {p.name for p in all_profiles()} | {p.name for p, _ in custom_profiles(session)}


class ProfileOut(BaseModel):
    id: Optional[int] = None
    name: str
    family: str
    scheduler: str
    quantum: Optional[int] = None
    preemptive: bool
    aging_rate: float
    placement: str
    banker: str
    quota_per_user: Optional[int] = None
    reserved_role: Optional[str] = None
    reserved_pct: float
    preempt_by: List[str]
    backfill: bool
    is_custom: bool = False
    weights: Optional[dict] = None


def profile_to_out(p: Profile, record_id: Optional[int] = None, is_custom: bool = False) -> ProfileOut:
    return ProfileOut(
        id=record_id,
        name=p.name,
        family=p.family,
        scheduler=p.scheduler.value,
        quantum=p.quantum,
        preemptive=p.preemptive,
        aging_rate=p.aging_rate,
        placement=p.placement.value,
        banker=p.banker.value,
        quota_per_user=p.quota_per_user,
        reserved_role=p.reserved_role.value if p.reserved_role else None,
        reserved_pct=p.reserved_pct,
        preempt_by=[r.value for r in p.preempt_by],
        backfill=p.backfill,
        is_custom=is_custom,
        weights=p.weights.model_dump() if p.weights else None,
    )


@router.get("", response_model=List[ProfileOut])
def list_profiles(
    family:    Optional[str] = Query(None),
    scheduler: Optional[str] = Query(None),
    placement: Optional[str] = Query(None),
    banker:    Optional[str] = Query(None),
    q:         Optional[str] = Query(None, description="Name search"),
    limit:     int = Query(1000, ge=1, le=1000),
    offset:    int = Query(0, ge=0),
    session:   Session = Depends(get_session),
):
    """Built-in profiles (18 base, then variants) followed by custom profiles.
    Filters, search and paging apply to the combined list."""
    sched_enum = SchedulerKind(scheduler) if scheduler else None
    place_enum = PlacementKind(placement) if placement else None
    bank_enum  = BankerMode(banker) if banker else None

    entries = [(p, None, False) for p in all_profiles()]
    entries += [(p, rid, True) for p, rid in custom_profiles(session)]

    needle = q.lower() if q else None
    matched = [
        (p, rid, is_custom) for p, rid, is_custom in entries
        if (not family or p.family == family)
        and (not sched_enum or p.scheduler == sched_enum)
        and (not place_enum or p.placement == place_enum)
        and (not bank_enum or p.banker == bank_enum)
        and (not needle or needle in p.name.lower())
    ]
    return [profile_to_out(p, rid, is_custom=c) for p, rid, c in matched[offset:offset + limit]]


@router.get("/{name}", response_model=ProfileOut)
def get_profile(name: str, session: Session = Depends(get_session)):
    # Check built-in
    for p in all_profiles():
        if p.name == name:
            return profile_to_out(p)
    # Check custom
    rec = session.exec(select(ProfileRecord).where(ProfileRecord.name == name)).first()
    if rec:
        return profile_to_out(Profile.from_json(rec.data), rec.id, is_custom=True)
    raise HTTPException(status_code=404, detail=f"Profile '{name}' not found")


class ValidateRequest(BaseModel):
    data: dict


@router.post("/validate")
def validate_profile(req: ValidateRequest):
    try:
        p = Profile(**req.data)
        errors = p.collect_errors()
        return {"valid": len(errors) == 0, "errors": errors}
    except Exception as e:
        return {"valid": False, "errors": [str(e)]}


@router.post("/custom", response_model=ProfileOut)
def create_custom_profile(req: ValidateRequest, session: Session = Depends(get_session)):
    data = dict(req.data)
    if isinstance(data.get("name"), str):
        data["name"] = data["name"].strip()
    if not data.get("name"):
        raise_422([error_item(["data", "name"], "Profile name is required")])
    try:
        p = Profile(**data)
    except ValidationError as e:
        raise_422(pydantic_errors(e, prefix=["data"]))

    # Names are the lookup key everywhere (runs, calendar, live), so a custom
    # profile must never shadow a built-in or another custom profile.
    if p.name in known_profile_names(session):
        raise HTTPException(status_code=409, detail=f"A profile named '{p.name}' already exists")
    rec = ProfileRecord(
        name=p.name, family=p.family,
        data=p.to_json(), is_custom=True,
    )
    session.add(rec)
    session.commit()
    session.refresh(rec)
    return profile_to_out(p, rec.id, is_custom=True)


@router.get("/export/{name}")
def export_profile(name: str, session: Session = Depends(get_session)):
    for p in all_profiles():
        if p.name == name:
            return json.loads(p.to_json())
    rec = session.exec(select(ProfileRecord).where(ProfileRecord.name == name)).first()
    if rec:
        return json.loads(rec.data)
    raise HTTPException(status_code=404, detail="Profile not found")
