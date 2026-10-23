"""
engine/schedule.py – Profile schedule (calendar slots + trigger rules).

See spec §6.8.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from engine.model import Role
from engine.profiles import Profile, BASE_PROFILE_MAP


# ---------------------------------------------------------------------------
# Calendar slot
# ---------------------------------------------------------------------------

class CalendarSlot(BaseModel):
    """A repeating weekly calendar entry."""
    day_of_week: int = Field(ge=0, le=6, description="0=Monday")
    start_minute: int = Field(ge=0, lt=1440)
    end_minute:   int = Field(ge=1, le=1440)
    profile_name: str

    model_config = {"frozen": True}

    def matches(self, sim_minute: int) -> bool:
        """Does this slot cover the given simulation minute?
        Simulation starts Monday 00:00 (day 0).
        """
        day = (sim_minute // 1440) % 7
        minute_in_day = sim_minute % 1440
        return (
            day == self.day_of_week
            and self.start_minute <= minute_in_day < self.end_minute
        )


# ---------------------------------------------------------------------------
# Trigger condition
# ---------------------------------------------------------------------------

class TriggerCondition(BaseModel):
    """A single AND-condition in a trigger rule."""
    field: str    # queue_len | nodes_down | min_slack | util | queued_role_count[role] | running_count
    op: str       # < | > | <= | >= | == | !=
    value: float

    model_config = {"frozen": True}

    def evaluate(self, state: Dict[str, Any]) -> bool:
        """Evaluate this condition against the current engine state."""
        # Extract field value (never uses eval())
        field_val = _extract_field(self.field, state)
        if field_val is None:
            return False
        ops = {
            "<":  lambda a, b: a < b,
            ">":  lambda a, b: a > b,
            "<=": lambda a, b: a <= b,
            ">=": lambda a, b: a >= b,
            "==": lambda a, b: a == b,
            "!=": lambda a, b: a != b,
        }
        fn = ops.get(self.op)
        if fn is None:
            return False
        return fn(float(field_val), self.value)


def _extract_field(field: str, state: Dict[str, Any]) -> Optional[float]:
    if field == "queue_len":
        return float(state.get("queue_len", 0))
    if field == "nodes_down":
        return float(state.get("nodes_down", 0))
    if field == "min_slack":
        return float(state.get("min_slack", 9999))
    if field == "util":
        return float(state.get("util", 0.0))
    if field == "running_count":
        return float(state.get("running_count", 0))
    if field.startswith("queued_role_count["):
        role_name = field[len("queued_role_count["):-1]
        counts = state.get("queued_role_counts", {})
        return float(counts.get(role_name, 0))
    return None


# ---------------------------------------------------------------------------
# Trigger rule
# ---------------------------------------------------------------------------

class TriggerRule(BaseModel):
    priority: int = 0    # higher = checked first
    conditions: List[TriggerCondition]
    profile_name: str
    cooldown: int = 5    # minimum units between triggers

    model_config = {"frozen": True}

    def matches(self, state: Dict[str, Any]) -> bool:
        return all(c.evaluate(state) for c in self.conditions)


# ---------------------------------------------------------------------------
# Schedule (calendar + trigger rules)
# ---------------------------------------------------------------------------

class Schedule(BaseModel):
    slots: List[CalendarSlot] = Field(default_factory=list)
    rules: List[TriggerRule] = Field(default_factory=list)
    default_profile_name: str = "practical_session"

    model_config = {"frozen": True}

    def active_profile_name(
        self,
        sim_minute: int,
        state: Dict[str, Any],
        last_trigger_time: Dict[str, int],
        now: int,
    ) -> tuple[str, str]:
        """
        Return (profile_name, reason: 'calendar'|'trigger'|'default').
        """
        # Check triggers first (priority ordered)
        sorted_rules = sorted(self.rules, key=lambda r: -r.priority)
        for rule in sorted_rules:
            last = last_trigger_time.get(rule.profile_name, -9999)
            if now - last < rule.cooldown:
                continue
            if rule.matches(state):
                last_trigger_time[rule.profile_name] = now
                return rule.profile_name, "trigger"

        # Check calendar
        for slot in self.slots:
            if slot.matches(sim_minute):
                return slot.profile_name, "calendar"

        return self.default_profile_name, "default"
