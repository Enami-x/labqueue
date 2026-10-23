"""
engine/model.py – Core domain model for LabQueue.

All types are frozen Pydantic v2 models so they are hashable and JSON-round-trippable.
Time is integer minutes (1 unit = 1 simulated minute).
"""

from __future__ import annotations

import enum
from typing import Dict, FrozenSet, List, Optional, Tuple

from pydantic import BaseModel, Field, field_validator, model_validator


# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------


class Role(str, enum.Enum):
    faculty = "faculty"
    phd = "phd"
    exam = "exam"        # session role
    demo = "demo"        # session role
    ug = "ug"
    guest = "guest"


class JobKind(str, enum.Enum):
    training = "training"
    preprocess = "preprocess"
    inference = "inference"
    assignment = "assignment"
    demo = "demo"


class JobState(str, enum.Enum):
    queued = "queued"
    running = "running"
    blocked = "blocked"
    preempted = "preempted"
    done = "done"


class SchedulerKind(str, enum.Enum):
    FCFS = "FCFS"
    SJF = "SJF"
    RR = "RR"
    PRIORITY = "PRIORITY"


class PlacementKind(str, enum.Enum):
    first = "first"
    best = "best"
    worst = "worst"


class BankerMode(str, enum.Enum):
    off = "off"
    lenient = "lenient"
    strict = "strict"


# ---------------------------------------------------------------------------
# Base role priorities (normalized)
# ---------------------------------------------------------------------------

ROLE_PRIORITY: Dict[Role, float] = {
    Role.faculty: 1.0,
    Role.exam:    0.9,
    Role.demo:    0.9,
    Role.phd:     0.8,
    Role.ug:      0.4,
    Role.guest:   0.2,
}


# ---------------------------------------------------------------------------
# Resource types
# ---------------------------------------------------------------------------

class PooledResources(BaseModel):
    """Cluster-wide pooled resource quantities (gpu / lic / io)."""
    gpu: int = Field(default=0, ge=0)
    lic: int = Field(default=0, ge=0)
    io:  int = Field(default=0, ge=0)

    model_config = {"frozen": True}

    def __add__(self, other: "PooledResources") -> "PooledResources":
        return PooledResources(
            gpu=self.gpu + other.gpu,
            lic=self.lic + other.lic,
            io=self.io + other.io,
        )

    def __sub__(self, other: "PooledResources") -> "PooledResources":
        return PooledResources(
            gpu=self.gpu - other.gpu,
            lic=self.lic - other.lic,
            io=self.io - other.io,
        )

    def __le__(self, other: "PooledResources") -> bool:
        return self.gpu <= other.gpu and self.lic <= other.lic and self.io <= other.io

    def __ge__(self, other: "PooledResources") -> bool:
        return self.gpu >= other.gpu and self.lic >= other.lic and self.io >= other.io

    def is_zero(self) -> bool:
        return self.gpu == 0 and self.lic == 0 and self.io == 0

    def as_tuple(self) -> Tuple[int, int, int]:
        return (self.gpu, self.lic, self.io)


ZERO_POOLED = PooledResources()


# ---------------------------------------------------------------------------
# Phase: pooled resource request at a job's runtime offset
# ---------------------------------------------------------------------------

class Phase(BaseModel):
    """A pooled resource acquisition that fires at 'at' minutes into the job's run."""
    at: int = Field(ge=0, description="Offset in minutes from job start")
    request: PooledResources

    model_config = {"frozen": True}


# ---------------------------------------------------------------------------
# Node
# ---------------------------------------------------------------------------

class Node(BaseModel):
    id: int
    name: str
    cpu: int = Field(ge=1)
    mem: int = Field(ge=1, description="Memory in GB")
    up: bool = True

    model_config = {"frozen": True}

    @property
    def is_large(self) -> bool:
        return self.cpu >= 16


# ---------------------------------------------------------------------------
# Cluster
# ---------------------------------------------------------------------------

class Cluster(BaseModel):
    nodes: List[Node]
    pooled: PooledResources  # Total cluster-wide pooled resources

    model_config = {"frozen": True}

    @field_validator("nodes")
    @classmethod
    def at_least_one_node(cls, v: List[Node]) -> List[Node]:
        if not v:
            raise ValueError("Cluster must have at least one node")
        return v

    def node_by_id(self, node_id: int) -> Optional[Node]:
        for n in self.nodes:
            if n.id == node_id:
                return n
        return None


# Default cluster: 2 large + 4 standard nodes, as per spec
DEFAULT_CLUSTER = Cluster(
    nodes=[
        Node(id=0, name="large-0", cpu=16, mem=64),
        Node(id=1, name="large-1", cpu=16, mem=64),
        Node(id=2, name="std-0",   cpu=8,  mem=32),
        Node(id=3, name="std-1",   cpu=8,  mem=32),
        Node(id=4, name="std-2",   cpu=8,  mem=32),
        Node(id=5, name="std-3",   cpu=8,  mem=32),
    ],
    pooled=PooledResources(gpu=6, lic=4, io=5),
)


# ---------------------------------------------------------------------------
# Job runtime state (mutable part, tracked during simulation)
# ---------------------------------------------------------------------------

class JobRuntime(BaseModel):
    """Mutable runtime fields for a job during simulation."""
    remaining: int          # burst units left
    node_id: Optional[int] = None
    cpu_alloc: int = 0
    mem_alloc: int = 0
    pooled_alloc: PooledResources = Field(default_factory=PooledResources)
    restarts: int = 0
    first_start: Optional[int] = None   # sim time of first start
    finish: Optional[int] = None        # sim time of finish
    preempted_total: int = 0            # cumulative time preempted

    model_config = {"frozen": False}   # runtime state is mutable


# ---------------------------------------------------------------------------
# Job (immutable declaration + mutable runtime)
# ---------------------------------------------------------------------------

class Job(BaseModel):
    """A job submitted to the lab queue."""
    id: str                              # unique string id, e.g. "j0042"
    user_id: str
    role: Role
    kind: JobKind
    arrival: int = Field(ge=0)
    burst: int = Field(ge=1, description="Declared runtime in minutes")
    deadline: Optional[int] = None       # absolute sim time; None = no deadline
    cpu: int = Field(ge=1)
    mem: int = Field(ge=1)
    phases: List[Phase] = Field(default_factory=list)

    # max_claim: per-spec, sum of all phase requests (declared up front for Banker's)
    max_claim: PooledResources = Field(default_factory=PooledResources)

    # Mutable state (not frozen)
    state: JobState = JobState.queued
    runtime: Optional[JobRuntime] = None

    model_config = {"frozen": False}

    @model_validator(mode="after")
    def init_runtime_and_claim(self) -> "Job":
        # Initialise runtime if not provided
        if self.runtime is None:
            self.runtime = JobRuntime(remaining=self.burst)
        # Compute max_claim from phases if not supplied
        if self.max_claim.is_zero() and self.phases:
            total = PooledResources()
            for phase in self.phases:
                total = total + phase.request
            object.__setattr__(self, "max_claim", total)
        return self

    # ------------------------------------------------------------------
    # Derived helpers
    # ------------------------------------------------------------------

    @property
    def wait_time(self) -> int:
        """Time between arrival and first_start (or still waiting)."""
        if self.runtime and self.runtime.first_start is not None:
            return self.runtime.first_start - self.arrival
        return 0

    @property
    def turnaround(self) -> Optional[int]:
        if self.runtime and self.runtime.finish is not None:
            return self.runtime.finish - self.arrival
        return None

    @property
    def response_time(self) -> Optional[int]:
        if self.runtime and self.runtime.first_start is not None:
            return self.runtime.first_start - self.arrival
        return None

    @property
    def slowdown(self) -> Optional[float]:
        ta = self.turnaround
        if ta is not None and self.burst > 0:
            return ta / self.burst
        return None

    def missed_deadline(self) -> bool:
        if self.deadline is None or self.runtime is None:
            return False
        finish = self.runtime.finish
        if finish is None:
            return False
        return finish > self.deadline

    def slack_at(self, now: int) -> Optional[float]:
        """Remaining slack: deadline - now - remaining_burst."""
        if self.deadline is None or self.runtime is None:
            return None
        return float(self.deadline - now - self.runtime.remaining)

    def __hash__(self) -> int:
        return hash(self.id)

    def __eq__(self, other: object) -> bool:
        if isinstance(other, Job):
            return self.id == other.id
        return NotImplemented


# ---------------------------------------------------------------------------
# RunResult placeholder (filled in by engine)
# ---------------------------------------------------------------------------

class RunResult(BaseModel):
    run_id: str
    events: List[dict] = Field(default_factory=list)
    metrics: dict = Field(default_factory=dict)
    event_log_hash: str = ""

    model_config = {"frozen": False}
