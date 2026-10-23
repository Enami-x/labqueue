"""
app/api/calendar.py – Calendar/schedule endpoints.
"""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import CalendarRecord, get_session
from engine.schedule import CalendarSlot, Schedule, TriggerCondition, TriggerRule

router = APIRouter(prefix="/api/calendar", tags=["calendar"])


@router.get("")
def get_calendar(session: Session = Depends(get_session)):
    rec = session.exec(select(CalendarRecord)).first()
    if not rec:
        return {"slots": [], "rules": [], "default_profile_name": "practical_session"}
    return json.loads(rec.data)


@router.put("")
def update_calendar(data: dict, session: Session = Depends(get_session)):
    # Validate
    try:
        schedule = Schedule.model_validate(data)
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail=str(e))

    rec = session.exec(select(CalendarRecord)).first()
    if rec:
        rec.data = schedule.model_dump_json()
    else:
        rec = CalendarRecord(data=schedule.model_dump_json())
        session.add(rec)
    session.commit()
    return json.loads(rec.data)
