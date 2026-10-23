"""
engine/events.py – Event type definitions and factory functions.

Every event: {seq, t, type, ...payload}
Events at same timestamp are processed in priority order:
  JOB_FINISH < NODE_DOWN/NODE_UP < PHASE_REQUEST < JOB_ARRIVAL
  < QUANTUM_EXPIRY < PROFILE_EVAL, then one DISPATCH pass.
"""

from __future__ import annotations

import enum
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


# ---------------------------------------------------------------------------
# Event ordering constants (lower = processed first)
# ---------------------------------------------------------------------------

class EventOrder(int, enum.Enum):
    JOB_FINISH     = 0
    NODE_DOWN      = 1
    NODE_UP        = 2
    PHASE_REQUEST  = 3
    JOB_ARRIVAL    = 4
    QUANTUM_EXPIRY = 5
    PROFILE_EVAL   = 6
    DISPATCH       = 7


# ---------------------------------------------------------------------------
# Event type names (string constants to keep payloads JSON-serialisable)
# ---------------------------------------------------------------------------

class EventType(str, enum.Enum):
    JOB_ARRIVED         = "JOB_ARRIVED"
    JOB_STARTED         = "JOB_STARTED"
    JOB_PREEMPTED       = "JOB_PREEMPTED"
    JOB_RESUMED         = "JOB_RESUMED"
    JOB_FINISHED        = "JOB_FINISHED"
    JOB_KILLED          = "JOB_KILLED"
    PHASE_REQUEST       = "PHASE_REQUEST"
    PHASE_GRANTED       = "PHASE_GRANTED"
    PHASE_BLOCKED       = "PHASE_BLOCKED"
    REQUEST_DENIED_UNSAFE = "REQUEST_DENIED_UNSAFE"
    DEADLOCK_DETECTED   = "DEADLOCK_DETECTED"
    DEADLOCK_RECOVERED  = "DEADLOCK_RECOVERED"
    NODE_DOWN           = "NODE_DOWN"
    NODE_UP             = "NODE_UP"
    PROFILE_SWITCHED    = "PROFILE_SWITCHED"
    QUEUE_STATE         = "QUEUE_STATE"
    STATE_SNAPSHOT      = "STATE_SNAPSHOT"


# ---------------------------------------------------------------------------
# Internal simulation event (used by the priority queue)
# ---------------------------------------------------------------------------

@dataclass(order=True)
class SimEvent:
    """An event on the simulation priority queue."""
    t: int                          # simulation time
    order: int                      # EventOrder value for tie-breaking
    seq: int                        # global monotone sequence id
    kind: str = field(compare=False)  # EventType value
    payload: Dict[str, Any] = field(default_factory=dict, compare=False)

    def to_log_entry(self) -> Dict[str, Any]:
        entry = {"seq": self.seq, "t": self.t, "type": self.kind}
        entry.update(self.payload)
        return entry


# ---------------------------------------------------------------------------
# Event counter (shared across a run)
# ---------------------------------------------------------------------------

class EventCounter:
    """Thread-unsafe monotone counter for event sequence IDs."""
    def __init__(self) -> None:
        self._n: int = 0

    def next(self) -> int:
        v = self._n
        self._n += 1
        return v

    @property
    def value(self) -> int:
        return self._n


# ---------------------------------------------------------------------------
# Reason codes emitted in QUEUE_STATE per-job entries
# ---------------------------------------------------------------------------

class WaitReason(str, enum.Enum):
    READY        = "READY"           # job is next to run (just waiting for CPU)
    QUOTA        = "QUOTA"           # user quota exceeded
    RESERVED     = "RESERVED"       # node reserved for another role
    NO_FIT       = "NO_FIT"          # no node has enough cpu/mem
    BANKER_UNSAFE = "BANKER_UNSAFE"  # Banker's safety check failed
    OUTRANKED    = "OUTRANKED"       # a higher-priority job is ahead
    HEAD_OF_LINE = "HEAD_OF_LINE"    # blocked at head (backfill=False)
