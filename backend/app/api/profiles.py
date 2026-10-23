"""
app/api/profiles.py – Profile endpoints.
"""

from __future__ import annotations

import json
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import ProfileRecord, get_session
from engine.model import BankerMode, PlacementKind, SchedulerKind
from engine.profiles import (
    BASE_PROFILES, Profile, all_profiles, filter_profiles
)

router = APIRouter(prefix="/api/profiles", tags=["profiles"])


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
    limit:     int = Query(200, ge=1, le=1000),
    offset:    int = Query(0, ge=0),
    session:   Session = Depends(get_session),
):
    profiles = all_profiles()

    sched_enum = SchedulerKind(scheduler) if scheduler else None
    place_enum = PlacementKind(placement) if placement else None
    bank_enum  = BankerMode(banker) if banker else None

    profiles = filter_profiles(profiles, family=family, scheduler=sched_enum,
                               placement=place_enum, banker=bank_enum)
    if q:
        profiles = [p for p in profiles if q.lower() in p.name.lower()]

    # Add custom profiles from DB
    custom_records = session.exec(select(ProfileRecord).where(ProfileRecord.is_custom == True)).all()
    custom = []
    for rec in custom_records:
        try:
            p = Profile.from_json(rec.data)
            custom.append((p, rec.id))
        except Exception:
            pass
    if family or scheduler or placement or banker:
        custom = [(p, rid) for p, rid in custom
                  if (not family or p.family == family)
                  and (not sched_enum or p.scheduler == sched_enum)
                  and (not place_enum or p.placement == place_enum)
                  and (not bank_enum or p.banker == bank_enum)]

    all_out = [profile_to_out(p) for p in profiles[offset:offset + limit]]
    all_out += [profile_to_out(p, rid, is_custom=True) for p, rid in custom]
    return all_out


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
    try:
        p = Profile(**req.data)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))
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
