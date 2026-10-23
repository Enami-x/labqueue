"""
engine/banker.py – Banker's algorithm for pooled resource safety.

Manages three resource types: gpu, lic, io.
Implements:
  - grant_request: checks and grants phase requests with modes off/lenient/strict
  - release: returns pooled resources when job finishes/is killed
  - detect_deadlock: standard circular-wait detection on blocked jobs
  - safety_check: Dijkstra-Habermann safety sequence

See spec §6.6 and §6.7.
"""

from __future__ import annotations

from typing import Dict, List, Optional, Set, Tuple

from engine.model import BankerMode, Job, JobState, PooledResources


# ---------------------------------------------------------------------------
# BankerState – tracks allocations, needs, availability
# ---------------------------------------------------------------------------

class BankerState:
    """
    Mutable state for the Banker's algorithm across a simulation run.

    All quantities are integer vectors of length 3: (gpu, lic, io).
    We store them as PooledResources for clarity.
    """

    def __init__(self, total: PooledResources) -> None:
        self.total = total
        self.available = PooledResources(gpu=total.gpu, lic=total.lic, io=total.io)
        # allocation[job_id] = currently held pooled resources
        self.allocation: Dict[str, PooledResources] = {}
        # max_claim[job_id] = declared maximum need
        self.max_claim:  Dict[str, PooledResources] = {}
        # outstanding blocked requests
        self.pending: Dict[str, PooledResources] = {}

    # ------------------------------------------------------------------
    # Registration / cleanup
    # ------------------------------------------------------------------

    def register(self, job: Job) -> None:
        """Register a job with its declared max_claim."""
        self.max_claim[job.id] = job.max_claim
        if job.id not in self.allocation:
            self.allocation[job.id] = PooledResources()

    def deregister(self, job_id: str) -> None:
        """Release a job's allocation and remove it from tracking."""
        alloc = self.allocation.pop(job_id, PooledResources())
        self.available = self.available + alloc
        self.max_claim.pop(job_id, None)
        self.pending.pop(job_id, None)

    # ------------------------------------------------------------------
    # Need
    # ------------------------------------------------------------------

    def need(self, job_id: str) -> PooledResources:
        max_c = self.max_claim.get(job_id, PooledResources())
        alloc = self.allocation.get(job_id, PooledResources())
        return PooledResources(
            gpu=max(0, max_c.gpu - alloc.gpu),
            lic=max(0, max_c.lic - alloc.lic),
            io=max(0, max_c.io - alloc.io),
        )

    # ------------------------------------------------------------------
    # Safety check (Dijkstra-Habermann)
    # ------------------------------------------------------------------

    def safety_sequence(
        self, extra_alloc: Optional[Tuple[str, PooledResources]] = None
    ) -> Optional[List[str]]:
        """
        Return a safe sequence if one exists, else None.
        If extra_alloc is (job_id, request), tentatively apply it first.
        """
        # Snapshot
        avail = PooledResources(
            gpu=self.available.gpu,
            lic=self.available.lic,
            io=self.available.io,
        )
        alloc: Dict[str, PooledResources] = dict(self.allocation)
        need: Dict[str, PooledResources] = {
            jid: self.need(jid) for jid in self.allocation
        }

        if extra_alloc is not None:
            jid, req = extra_alloc
            # Tentatively apply
            avail = avail - req
            if avail.gpu < 0 or avail.lic < 0 or avail.io < 0:
                return None  # not enough available
            old_alloc = alloc.get(jid, PooledResources())
            alloc[jid] = old_alloc + req
            old_need = need.get(jid, PooledResources())
            need[jid] = PooledResources(
                gpu=max(0, old_need.gpu - req.gpu),
                lic=max(0, old_need.lic - req.lic),
                io=max(0, old_need.io - req.io),
            )

        job_ids = list(alloc.keys())
        finished: Set[str] = set()
        sequence: List[str] = []

        changed = True
        while changed:
            changed = False
            for jid in job_ids:
                if jid in finished:
                    continue
                n = need[jid]
                if n <= avail:
                    # This job can finish
                    avail = avail + alloc[jid]
                    finished.add(jid)
                    sequence.append(jid)
                    changed = True

        if len(finished) == len(job_ids):
            return sequence
        return None

    # ------------------------------------------------------------------
    # Grant / block logic
    # ------------------------------------------------------------------

    def try_grant(
        self,
        job: Job,
        request: PooledResources,
        mode: BankerMode,
    ) -> Tuple[bool, str]:
        """
        Try to grant a pooled resource request.

        Returns (granted: bool, reason: str).
        Reason is empty on grant, or one of:
          "NOT_AVAILABLE" | "UNSAFE" | "GRANTED"
        """
        if job.id not in self.max_claim:
            self.register(job)

        need_now = self.need(job.id)

        # Spec: r > Need[j] is a bug
        if request.gpu > need_now.gpu or request.lic > need_now.lic or request.io > need_now.io:
            raise ValueError(
                f"Job {job.id} requested {request} > need {need_now}: programming error"
            )

        # Check availability
        if not (request <= self.available):
            return False, "NOT_AVAILABLE"

        if mode == BankerMode.off:
            self._do_grant(job.id, request)
            return True, "GRANTED"

        elif mode == BankerMode.lenient:
            # Safety check only if request includes GPU
            if request.gpu > 0:
                seq = self.safety_sequence(extra_alloc=(job.id, request))
                if seq is None:
                    return False, "UNSAFE"
            self._do_grant(job.id, request)
            return True, "GRANTED"

        elif mode == BankerMode.strict:
            seq = self.safety_sequence(extra_alloc=(job.id, request))
            if seq is None:
                return False, "UNSAFE"
            self._do_grant(job.id, request)
            return True, "GRANTED"

        raise ValueError(f"Unknown banker mode: {mode}")

    def _do_grant(self, job_id: str, request: PooledResources) -> None:
        self.available = self.available - request
        old = self.allocation.get(job_id, PooledResources())
        self.allocation[job_id] = old + request
        self.pending.pop(job_id, None)

    def set_pending(self, job_id: str, request: PooledResources) -> None:
        self.pending[job_id] = request

    def clear_pending(self, job_id: str) -> None:
        self.pending.pop(job_id, None)

    # ------------------------------------------------------------------
    # Deadlock detection (§6.7)
    # ------------------------------------------------------------------

    def detect_deadlock(
        self, blocked_jobs: List[Job]
    ) -> Optional[List[str]]:
        """
        Standard detection algorithm over blocked jobs.
        Returns the set of deadlocked job ids, or None if no deadlock.
        """
        if not blocked_jobs:
            return None

        blocked_ids = {j.id for j in blocked_jobs}
        # Work = available + alloc of non-blocked jobs (which could finish)
        non_blocked_alloc = PooledResources()
        for jid, alloc in self.allocation.items():
            if jid not in blocked_ids:
                non_blocked_alloc = non_blocked_alloc + alloc

        # Initially work = available + alloc of non-blocked jobs (which can finish and release)
        work = PooledResources(
            gpu=self.available.gpu + non_blocked_alloc.gpu,
            lic=self.available.lic + non_blocked_alloc.lic,
            io=self.available.io + non_blocked_alloc.io,
        )
        alloc_snap = {j.id: self.allocation.get(j.id, PooledResources()) for j in blocked_jobs}
        request_snap = {j.id: self.pending.get(j.id, PooledResources()) for j in blocked_jobs}

        finish: Set[str] = set()
        changed = True
        while changed:
            changed = False
            for j in blocked_jobs:
                if j.id in finish:
                    continue
                req = request_snap[j.id]
                if req <= work:
                    work = work + alloc_snap[j.id]
                    finish.add(j.id)
                    changed = True

        deadlocked = [j.id for j in blocked_jobs if j.id not in finish]
        return deadlocked if deadlocked else None

    # ------------------------------------------------------------------
    # Wait-for graph edges (for UI)
    # ------------------------------------------------------------------

    def wait_for_edges(self, blocked_jobs: List[Job], all_jobs: List[Job]) -> List[Tuple[str, str]]:
        """
        Returns edges (waiter_id, holder_id) for visualisation.
        A blocked job B waits for any job J that holds a resource B needs.
        """
        edges = []
        blocked_ids = {j.id for j in blocked_jobs}
        for bj in blocked_jobs:
            req = self.pending.get(bj.id, PooledResources())
            for j in all_jobs:
                if j.id == bj.id:
                    continue
                alloc = self.allocation.get(j.id, PooledResources())
                # B waits for J if J holds something B needs
                if (req.gpu > 0 and alloc.gpu > 0) or \
                   (req.lic > 0 and alloc.lic > 0) or \
                   (req.io  > 0 and alloc.io  > 0):
                    edges.append((bj.id, j.id))
        return edges
