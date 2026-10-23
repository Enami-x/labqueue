"""
engine/placement.py – Memory/CPU placement strategies.

first:  lowest node id that fits.
best:   minimises leftover mem (tie: lowest id).
worst:  maximises leftover mem (tie: lowest id).

Returns the node id or None if no node can fit the job.
"""

from __future__ import annotations

from typing import Dict, List, Optional, Tuple

from engine.model import Job, Node, PlacementKind


def _up_nodes_with_enough(
    nodes: List[Node],
    free_cpu: Dict[int, int],
    free_mem: Dict[int, int],
    job: Job,
) -> List[Node]:
    """Return up nodes that have enough free cpu and mem for the job."""
    return [
        n for n in nodes
        if n.up
        and free_cpu.get(n.id, 0) >= job.cpu
        and free_mem.get(n.id, 0) >= job.mem
    ]


def place(
    job: Job,
    nodes: List[Node],
    free_cpu: Dict[int, int],
    free_mem: Dict[int, int],
    strategy: PlacementKind,
) -> Optional[int]:
    """
    Choose a node for the job using the given placement strategy.
    Returns node_id or None if no node fits.
    """
    candidates = _up_nodes_with_enough(nodes, free_cpu, free_mem, job)
    if not candidates:
        return None

    if strategy == PlacementKind.first:
        # lowest node id
        return min(candidates, key=lambda n: n.id).id

    elif strategy == PlacementKind.best:
        # minimise leftover mem after placement (tie: lowest id)
        def best_key(n: Node) -> Tuple[int, int]:
            leftover = free_mem[n.id] - job.mem
            return (leftover, n.id)
        return min(candidates, key=best_key).id

    elif strategy == PlacementKind.worst:
        # maximise leftover mem (tie: lowest id)
        def worst_key(n: Node) -> Tuple[int, int]:
            leftover = free_mem[n.id] - job.mem
            # negate leftover for max, then positive id for tie
            return (-leftover, n.id)
        return min(candidates, key=worst_key).id

    raise ValueError(f"Unknown placement strategy: {strategy}")


def fragmentation(
    nodes: List[Node],
    free_mem: Dict[int, int],
) -> float:
    """
    External memory fragmentation = 1 - largest_free_block / total_free_mem.
    Returns 0.0 if total free mem is 0.
    """
    up_nodes = [n for n in nodes if n.up]
    total_free = sum(free_mem.get(n.id, 0) for n in up_nodes)
    if total_free == 0:
        return 0.0
    largest_free = max((free_mem.get(n.id, 0) for n in up_nodes), default=0)
    return 1.0 - largest_free / total_free
