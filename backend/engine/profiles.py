"""
engine/profiles.py – Profile schema, validation, 18 base profiles,
                     variant generator (~600), and custom profile builder.

See spec §7.
"""

from __future__ import annotations

import itertools
import json
from typing import Any, Dict, FrozenSet, Iterator, List, Optional, Set, Tuple

from pydantic import BaseModel, Field, field_validator, model_validator

from engine.model import BankerMode, PlacementKind, Role, SchedulerKind


# ---------------------------------------------------------------------------
# Weight presets
# ---------------------------------------------------------------------------

class Weights(BaseModel):
    role:     float = Field(ge=0.0)
    deadline: float = Field(ge=0.0)
    wait:     float = Field(ge=0.0)
    size:     float = Field(ge=0.0)

    model_config = {"frozen": True}


W_DEADLINE = Weights(role=0.2, deadline=0.6, wait=0.1, size=0.1)
W_ROLE     = Weights(role=0.6, deadline=0.2, wait=0.1, size=0.1)
W_WAIT     = Weights(role=0.1, deadline=0.1, wait=0.7, size=0.1)
W_SMALL    = Weights(role=0.1, deadline=0.3, wait=0.2, size=0.4)
W_MIXED    = Weights(role=0.3, deadline=0.3, wait=0.3, size=0.1)


WEIGHT_PRESETS: Dict[str, Weights] = {
    "W_DEADLINE": W_DEADLINE,
    "W_ROLE":     W_ROLE,
    "W_WAIT":     W_WAIT,
    "W_SMALL":    W_SMALL,
    "W_MIXED":    W_MIXED,
}


# ---------------------------------------------------------------------------
# Profile schema
# ---------------------------------------------------------------------------

class Profile(BaseModel):
    """A scheduling + resource-management policy bundle."""

    name:       str
    family:     str

    scheduler:  SchedulerKind
    quantum:    Optional[int]   = None   # RR only
    preemptive: bool            = False  # SJF->SRTF / PRIORITY preemptive

    # PRIORITY weights (must be set and not all-zero for PRIORITY)
    weights:     Optional[Weights] = None
    aging_rate:  float = Field(default=0.0, ge=0.0)

    placement:   PlacementKind
    banker:      BankerMode

    quota_per_user:  Optional[int] = Field(default=None, ge=1)
    reserved_role:   Optional[Role] = None
    reserved_pct:    float = Field(default=0.0, ge=0.0, le=0.8)
    preempt_by:      List[Role] = Field(default_factory=list)
    backfill:        bool = True

    model_config = {"frozen": True}

    # ------------------------------------------------------------------
    # Validation
    # ------------------------------------------------------------------

    def collect_errors(self) -> List[str]:
        """Return all validation errors as a list (for inline UI messages)."""
        errors: List[str] = []
        if self.scheduler == SchedulerKind.RR:
            if self.quantum is None or self.quantum < 1:
                errors.append("RR scheduler requires quantum >= 1")
        else:
            if self.quantum is not None:
                errors.append("quantum is only valid for RR scheduler")

        if self.scheduler == SchedulerKind.PRIORITY:
            if self.weights is None:
                errors.append("PRIORITY scheduler requires weights")
            elif (self.weights.role + self.weights.deadline +
                  self.weights.wait + self.weights.size) == 0:
                errors.append("PRIORITY weights must not all be zero")

        if self.reserved_pct > 0 and self.reserved_role is None:
            errors.append("reserved_pct > 0 requires reserved_role")

        if self.scheduler == SchedulerKind.FCFS and self.backfill:
            errors.append("FCFS profiles should have backfill=False (strict head-of-line)")

        return errors

    @model_validator(mode="before")
    @classmethod
    def _pre_validate(cls, data: Any) -> Any:
        if isinstance(data, dict):
            sched = data.get("scheduler")
            if sched in (SchedulerKind.FCFS, "FCFS", SchedulerKind.FCFS.value) and "backfill" not in data:
                data["backfill"] = False
        return data

    @model_validator(mode="after")
    def _validate(self) -> "Profile":
        errors = self.collect_errors()
        if errors:
            raise ValueError("; ".join(errors))
        return self

    # ------------------------------------------------------------------
    # Identity / JSON round-trip
    # ------------------------------------------------------------------

    def config_key(self) -> tuple:
        """Hashable key based on semantically-meaningful fields (ignoring name)."""
        w = None
        if self.weights is not None:
            w = (self.weights.role, self.weights.deadline,
                 self.weights.wait, self.weights.size)
        return (
            self.scheduler,
            self.quantum,
            self.preemptive,
            w,
            self.aging_rate,
            self.placement,
            self.banker,
            self.quota_per_user,
            self.reserved_role,
            self.reserved_pct,
            tuple(sorted(r.value for r in self.preempt_by)),
            self.backfill,
        )

    def to_json(self) -> str:
        return self.model_dump_json()

    @classmethod
    def from_json(cls, s: str) -> "Profile":
        return cls.model_validate_json(s)


# ---------------------------------------------------------------------------
# 18 base profiles
# ---------------------------------------------------------------------------

BASE_PROFILES: List[Profile] = [
    # ---- academic -------------------------------------------------------
    Profile(
        name="practical_session", family="academic",
        scheduler=SchedulerKind.RR, quantum=4,
        placement=PlacementKind.best, banker=BankerMode.lenient,
        quota_per_user=2, backfill=True,
    ),
    Profile(
        name="exam_week", family="academic",
        scheduler=SchedulerKind.PRIORITY, preemptive=True,
        weights=W_DEADLINE,
        placement=PlacementKind.best, banker=BankerMode.strict,
        reserved_role=Role.exam, reserved_pct=0.30,
        preempt_by=[Role.exam, Role.faculty],
        backfill=True,
    ),
    Profile(
        name="midterm_week", family="academic",
        scheduler=SchedulerKind.PRIORITY, preemptive=False,
        weights=W_DEADLINE,
        placement=PlacementKind.best, banker=BankerMode.strict,
        reserved_role=Role.exam, reserved_pct=0.20,
        backfill=True,
    ),
    Profile(
        name="viva_demo", family="academic",
        scheduler=SchedulerKind.PRIORITY, preemptive=False,
        weights=W_ROLE,
        placement=PlacementKind.first, banker=BankerMode.lenient,
        reserved_role=Role.demo, reserved_pct=0.20,
        backfill=True,
    ),
    Profile(
        name="assignment_crunch", family="academic",
        scheduler=SchedulerKind.SJF, preemptive=False,
        aging_rate=0.05,
        placement=PlacementKind.best, banker=BankerMode.lenient,
        backfill=True,
    ),
    # ---- research -------------------------------------------------------
    Profile(
        name="thesis_deadline", family="research",
        scheduler=SchedulerKind.PRIORITY, preemptive=True,
        weights=W_ROLE,
        placement=PlacementKind.best, banker=BankerMode.strict,
        reserved_role=Role.phd, reserved_pct=0.40,
        preempt_by=[Role.phd, Role.faculty],
        backfill=True,
    ),
    Profile(
        name="long_run_training", family="research",
        scheduler=SchedulerKind.FCFS,
        placement=PlacementKind.worst, banker=BankerMode.strict,
        quota_per_user=1, backfill=False,
    ),
    Profile(
        name="paper_rush", family="research",
        scheduler=SchedulerKind.PRIORITY, preemptive=True,
        weights=W_DEADLINE,
        placement=PlacementKind.best, banker=BankerMode.strict,
        preempt_by=[Role.phd, Role.faculty],
        backfill=True,
    ),
    # ---- events ---------------------------------------------------------
    Profile(
        name="hackathon_night", family="events",
        scheduler=SchedulerKind.RR, quantum=2,
        placement=PlacementKind.first, banker=BankerMode.lenient,
        quota_per_user=3, backfill=True,
    ),
    Profile(
        name="workshop", family="events",
        scheduler=SchedulerKind.RR, quantum=8,
        placement=PlacementKind.first, banker=BankerMode.off,
        quota_per_user=1, backfill=True,
    ),
    Profile(
        name="placement_test_drive", family="events",
        scheduler=SchedulerKind.FCFS,
        placement=PlacementKind.first, banker=BankerMode.off,
        reserved_role=Role.guest, reserved_pct=0.60,
        backfill=False,
    ),
    # ---- load -----------------------------------------------------------
    Profile(
        name="peak_overload", family="load",
        scheduler=SchedulerKind.SJF,
        aging_rate=0.10,
        placement=PlacementKind.best, banker=BankerMode.strict,
        quota_per_user=2, backfill=True,
    ),
    Profile(
        name="offpeak_batch", family="load",
        scheduler=SchedulerKind.SJF,
        placement=PlacementKind.worst, banker=BankerMode.lenient,
        backfill=True,
    ),
    Profile(
        name="node_failure", family="load",
        scheduler=SchedulerKind.PRIORITY, preemptive=True,
        weights=W_SMALL,
        placement=PlacementKind.best, banker=BankerMode.strict,
        quota_per_user=1, backfill=True,
    ),
    # ---- fairness -------------------------------------------------------
    Profile(
        name="strict_fair_share", family="fairness",
        scheduler=SchedulerKind.PRIORITY,
        weights=W_WAIT,
        placement=PlacementKind.first, banker=BankerMode.lenient,
        quota_per_user=2, backfill=True,
    ),
    Profile(
        name="quota_capped", family="fairness",
        scheduler=SchedulerKind.FCFS,
        placement=PlacementKind.first, banker=BankerMode.lenient,
        quota_per_user=1, backfill=False,
    ),
    Profile(
        name="anti_starvation", family="fairness",
        scheduler=SchedulerKind.PRIORITY,
        weights=W_MIXED,
        aging_rate=0.20,
        placement=PlacementKind.best, banker=BankerMode.lenient,
        backfill=True,
    ),
    Profile(
        name="role_reserved", family="fairness",
        scheduler=SchedulerKind.PRIORITY,
        weights=W_ROLE,
        placement=PlacementKind.first, banker=BankerMode.lenient,
        reserved_role=Role.faculty, reserved_pct=0.50,
        backfill=True,
    ),
]

BASE_PROFILE_MAP: Dict[str, Profile] = {p.name: p for p in BASE_PROFILES}


# ---------------------------------------------------------------------------
# Variant generator (~600 profiles)
# ---------------------------------------------------------------------------

_PLACEMENTS = list(PlacementKind)
_BANKERS    = list(BankerMode)
_QUANTUMS   = [2, 4, 8]
_AGING_RATES = [0.0, 0.05, 0.1, 0.2]


def _variant_name(base: Profile, placement: PlacementKind, banker: BankerMode, knob_key: str, knob_val: Any) -> str:
    return f"{base.name}[{placement.value}|{banker.value}|{knob_key}{knob_val}]"


def generate_variants() -> List[Profile]:
    """
    Generate ~600 variant profiles.
    For each base: sweep placement x banker x knob.
    knob = quantum in {2,4,8} for RR, else aging_rate in {0,.05,.1,.2}.
    Deduplicates identical configs (ignoring name).
    """
    seen_keys: Set[tuple] = set()
    variants: List[Profile] = []

    for base in BASE_PROFILES:
        is_rr = base.scheduler == SchedulerKind.RR
        knob_values = _QUANTUMS if is_rr else _AGING_RATES
        knob_key = "q" if is_rr else "age"

        for placement, banker, knob_val in itertools.product(
            _PLACEMENTS, _BANKERS, knob_values
        ):
            # Build variant kwargs
            kwargs: Dict[str, Any] = base.model_dump()
            kwargs["placement"] = placement
            kwargs["banker"] = banker
            kwargs["name"] = _variant_name(base, placement, banker, knob_key, knob_val)
            kwargs["family"] = base.family

            if is_rr:
                kwargs["quantum"] = knob_val
            else:
                kwargs["aging_rate"] = knob_val

            # FCFS must have backfill=False
            if kwargs["scheduler"] == SchedulerKind.FCFS:
                kwargs["backfill"] = False

            try:
                p = Profile(**kwargs)
            except ValueError:
                continue  # skip invalid combos (e.g. pct>0 no role)

            key = p.config_key()
            if key in seen_keys:
                continue
            seen_keys.add(key)
            variants.append(p)

    return variants


# Cache
_VARIANTS: Optional[List[Profile]] = None


def all_variants() -> List[Profile]:
    global _VARIANTS
    if _VARIANTS is None:
        _VARIANTS = generate_variants()
    return _VARIANTS


def all_profiles() -> List[Profile]:
    """Base + variant profiles combined."""
    seen_keys: Set[tuple] = set()
    result: List[Profile] = []
    for p in BASE_PROFILES:
        k = p.config_key()
        seen_keys.add(k)
        result.append(p)
    for p in all_variants():
        k = p.config_key()
        if k not in seen_keys:
            seen_keys.add(k)
            result.append(p)
    return result


# ---------------------------------------------------------------------------
# Profile filtering facets
# ---------------------------------------------------------------------------

def filter_profiles(
    profiles: List[Profile],
    family:    Optional[str] = None,
    scheduler: Optional[SchedulerKind] = None,
    placement: Optional[PlacementKind] = None,
    banker:    Optional[BankerMode] = None,
) -> List[Profile]:
    result = profiles
    if family:
        result = [p for p in result if p.family == family]
    if scheduler:
        result = [p for p in result if p.scheduler == scheduler]
    if placement:
        result = [p for p in result if p.placement == placement]
    if banker:
        result = [p for p in result if p.banker == banker]
    return result
