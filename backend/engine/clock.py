"""
engine/clock.py – Clock and Executor abstractions.

SimClock:      advances instantly to the next event time.
SimExecutor:   schedules a synthetic JOB_FINISH at now + remaining.

WallClock / ProcessExecutor live in live/ and implement the same ABC.
"""

from __future__ import annotations

import abc
from typing import TYPE_CHECKING, Callable, List, Optional

if TYPE_CHECKING:
    from engine.events import SimEvent


# ---------------------------------------------------------------------------
# Clock ABC
# ---------------------------------------------------------------------------

class Clock(abc.ABC):
    """Abstract clock used by the engine."""

    @property
    @abc.abstractmethod
    def now(self) -> int:
        """Current simulation time."""

    @abc.abstractmethod
    def advance(self, to: int) -> None:
        """Advance clock to the given time (must be >= now)."""


# ---------------------------------------------------------------------------
# SimClock – instant discrete-event clock
# ---------------------------------------------------------------------------

class SimClock(Clock):
    def __init__(self) -> None:
        self._t: int = 0

    @property
    def now(self) -> int:
        return self._t

    def advance(self, to: int) -> None:
        if to < self._t:
            raise ValueError(f"Cannot go back in time: {to} < {self._t}")
        self._t = to


# ---------------------------------------------------------------------------
# Executor ABC
# ---------------------------------------------------------------------------

class Executor(abc.ABC):
    """Decides what happens when a job starts/is preempted/is killed."""

    @abc.abstractmethod
    def start(self, job_id: str, remaining: int, now: int,
              schedule_finish: Callable[[int, str], None]) -> None:
        """Begin executing a job.  schedule_finish(at, job_id) is called by
        implementations to register a JOB_FINISH event."""

    @abc.abstractmethod
    def preempt(self, job_id: str) -> int:
        """Suspend the job; return actual remaining time."""

    @abc.abstractmethod
    def resume(self, job_id: str, remaining: int, now: int,
               schedule_finish: Callable[[int, str], None]) -> None:
        """Resume a preempted job."""

    @abc.abstractmethod
    def kill(self, job_id: str) -> None:
        """Kill the job outright."""


# ---------------------------------------------------------------------------
# SimExecutor – synthetic completions, no real processes
# ---------------------------------------------------------------------------

class SimExecutor(Executor):
    """Executor for sim mode: schedules synthetic JOB_FINISH events."""

    def __init__(self) -> None:
        # Maps job_id -> (start_time, remaining_at_start)
        self._running: dict[str, tuple[int, int]] = {}

    def start(self, job_id: str, remaining: int, now: int,
              schedule_finish: Callable[[int, str], None]) -> None:
        self._running[job_id] = (now, remaining)
        schedule_finish(now + remaining, job_id)

    def preempt(self, job_id: str) -> int:
        # The engine tracks elapsed time itself; SimExecutor just removes the entry.
        self._running.pop(job_id, None)
        # Actual remaining is tracked by the engine via Job.runtime.remaining
        return 0   # unused in sim mode

    def resume(self, job_id: str, remaining: int, now: int,
               schedule_finish: Callable[[int, str], None]) -> None:
        self.start(job_id, remaining, now, schedule_finish)

    def kill(self, job_id: str) -> None:
        self._running.pop(job_id, None)
