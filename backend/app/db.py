"""
app/db.py – SQLite database setup with SQLModel.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlmodel import Field, Session, SQLModel, create_engine, select


DATABASE_URL = "sqlite:///./labqueue.db"
engine = create_engine(DATABASE_URL, echo=False)


# ---------------------------------------------------------------------------
# DB Models
# ---------------------------------------------------------------------------

class ProfileRecord(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    family: str = Field(index=True)
    data: str  # JSON of Profile
    is_custom: bool = False
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class WorkloadRecord(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    scenario: str
    seed: int
    data: str  # JSON of workload dict
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class RunRecord(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    run_id: str = Field(index=True)
    workload_id: int
    profile_name: str
    seed: int
    metrics: str  # JSON
    event_log_hash: str = ""
    events: str = "[]"  # JSON (large; consider file storage for prod)
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class BatchRecord(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    status: str = "pending"  # pending | running | done | error
    scenario_ids: str  # JSON list
    profile_filter: str = "{}"  # JSON
    matrix: str = "{}"  # JSON: {scenario: {profile: metrics}}
    progress: int = 0
    total: int = 0
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class CalendarRecord(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    data: str  # JSON of Schedule
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


# ---------------------------------------------------------------------------
# Initialization
# ---------------------------------------------------------------------------

def init_db() -> None:
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
