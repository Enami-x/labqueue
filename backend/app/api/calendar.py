"""
app/api/calendar.py – Calendar/schedule endpoints.
"""

from __future__ import annotations

import json
from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import ValidationError
from sqlmodel import Session, select

from app.api.errors import error_item, pydantic_errors, raise_422
from app.api.profiles import known_profile_names
from app.db import CalendarRecord, get_session
from engine.schedule import Schedule

router = APIRouter(prefix="/api/calendar", tags=["calendar"])

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
CONDITION_FIELDS = {"queue_len", "nodes_down", "min_slack", "util", "running_count"}
CONDITION_OPS = {"<", ">", "<=", ">=", "==", "!="}
DEFAULT_SCHEDULE = {"slots": [], "rules": [], "default_profile_name": "practical_session"}


def _hhmm(minute: int) -> str:
    return f"{minute // 60:02d}:{minute % 60:02d}"


def validate_schedule(data: dict, session: Session) -> Schedule:
    """Parse and semantically validate a schedule; raise a 422 listing every problem."""
    try:
        schedule = Schedule.model_validate(data)
    except ValidationError as e:
        raise_422(pydantic_errors(e))

    known = known_profile_names(session)
    errors: List[dict] = []

    if schedule.default_profile_name not in known:
        errors.append(error_item(
            ["default_profile_name"],
            f"Default profile '{schedule.default_profile_name}' does not exist",
        ))

    for i, slot in enumerate(schedule.slots):
        label = f"Slot {i + 1} ({DAYS[slot.day_of_week]})"
        if slot.start_minute >= slot.end_minute:
            errors.append(error_item(
                ["slots", i, "end_minute"],
                f"{label}: start {_hhmm(slot.start_minute)} must be before end {_hhmm(slot.end_minute)}",
            ))
        if slot.profile_name not in known:
            errors.append(error_item(
                ["slots", i, "profile_name"],
                f"{label}: profile '{slot.profile_name}' does not exist",
            ))

    for i, rule in enumerate(schedule.rules):
        label = f"Rule {i + 1}"
        if rule.profile_name not in known:
            errors.append(error_item(
                ["rules", i, "profile_name"],
                f"{label}: profile '{rule.profile_name}' does not exist",
            ))
        if not rule.conditions:
            errors.append(error_item(["rules", i, "conditions"], f"{label}: needs at least one condition"))
        for j, cond in enumerate(rule.conditions):
            field_ok = cond.field in CONDITION_FIELDS or (
                cond.field.startswith("queued_role_count[") and cond.field.endswith("]")
            )
            if not field_ok:
                errors.append(error_item(
                    ["rules", i, "conditions", j, "field"],
                    f"{label}: unknown condition field '{cond.field}'",
                ))
            if cond.op not in CONDITION_OPS:
                errors.append(error_item(
                    ["rules", i, "conditions", j, "op"],
                    f"{label}: unknown operator '{cond.op}'",
                ))

    if errors:
        raise_422(errors)
    return schedule


def load_saved_schedule(session: Session) -> Optional[Schedule]:
    rec = session.exec(select(CalendarRecord)).first()
    if not rec:
        return None
    return Schedule.model_validate_json(rec.data)


@router.get("")
def get_calendar(session: Session = Depends(get_session)):
    rec = session.exec(select(CalendarRecord)).first()
    if not rec:
        return dict(DEFAULT_SCHEDULE)
    return json.loads(rec.data)


@router.put("")
def update_calendar(data: dict, session: Session = Depends(get_session)):
    schedule = validate_schedule(data, session)

    rec = session.exec(select(CalendarRecord)).first()
    if rec:
        rec.data = schedule.model_dump_json()
    else:
        rec = CalendarRecord(data=schedule.model_dump_json())
        session.add(rec)
    session.commit()
    return json.loads(rec.data)
