"""
app/db.py – SQLite database setup with SQLModel.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from sqlmodel import Field, Session, SQLModel, create_engine, select


BACKEND_DIR = Path(__file__).resolve().parent.parent

# Absolute path so the DB location doesn't depend on the working directory.
# Override with LABQUEUE_DATABASE_URL (the test suite points it at a temp file).
DATABASE_URL = os.environ.get(
    "LABQUEUE_DATABASE_URL",
    f"sqlite:///{(BACKEND_DIR / 'labqueue.db').as_posix()}",
)
engine = create_engine(DATABASE_URL, echo=False)


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# DB Models
# ---------------------------------------------------------------------------

class ProfileRecord(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    family: str = Field(index=True)
    data: str  # JSON of Profile
    is_custom: bool = False
    created_at: str = Field(default_factory=_utcnow_iso)


class WorkloadRecord(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    scenario: str
    seed: int
    data: str  # JSON of workload dict
    created_at: str = Field(default_factory=_utcnow_iso)


class RunRecord(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    run_id: str = Field(index=True)
    workload_id: int
    profile_name: str
    seed: int
    metrics: str  # JSON
    event_log_hash: str = ""
    events: str = "[]"  # JSON (large; consider file storage for prod)
    created_at: str = Field(default_factory=_utcnow_iso)


class BatchRecord(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    status: str = "pending"  # pending | running | done | error
    scenario_ids: str  # JSON list
    profile_filter: str = "{}"  # JSON
    matrix: str = "{}"  # JSON: {scenario: {profile: metrics}}
    progress: int = 0
    total: int = 0
    error: str = ""
    created_at: str = Field(default_factory=_utcnow_iso)


class CalendarRecord(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    data: str  # JSON of Schedule
    updated_at: str = Field(default_factory=_utcnow_iso)


# ---------------------------------------------------------------------------
# Initialization
# ---------------------------------------------------------------------------

def init_db() -> None:
    SQLModel.metadata.create_all(engine)
    _add_missing_columns()


def _add_missing_columns() -> None:
    """create_all() doesn't alter existing tables; add columns introduced later."""
    from sqlalchemy import inspect, text

    added = {"batchrecord": {"error": "VARCHAR NOT NULL DEFAULT ''"}}
    insp = inspect(engine)
    with engine.begin() as conn:
        for table, cols in added.items():
            if not insp.has_table(table):
                continue
            existing = {c["name"] for c in insp.get_columns(table)}
            for name, ddl in cols.items():
                if name not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))


def get_session():
    with Session(engine) as session:
        yield session
