"""
tests/test_stage4.py – Stage 4 tests: Profiles, Variants, Schedule (calendar + triggers).

Spec §7, §6.8, §13 Stage 4.
"""

from __future__ import annotations

import pytest

from engine.events import EventType
from engine.model import (
    Cluster, Job, JobKind, Node, PlacementKind, PooledResources, Role,
    SchedulerKind, BankerMode, DEFAULT_CLUSTER
)
from engine.profiles import (
    BASE_PROFILES, BASE_PROFILE_MAP, Profile, Weights, all_profiles,
    filter_profiles, generate_variants
)
from engine.schedule import CalendarSlot, Schedule, TriggerCondition, TriggerRule
from engine.engine import run


class TestStage4ProfilesAndSchedule:
    def test_base_profiles_count_and_uniqueness(self):
        assert len(BASE_PROFILES) == 18
        names = [p.name for p in BASE_PROFILES]
        assert len(names) == len(set(names))

    def test_variant_generation_count(self):
        variants = generate_variants()
        # Spec says ~600 concrete variants
        assert 500 <= len(variants) <= 700

    def test_filter_profiles(self):
        profs = all_profiles()
        academic = filter_profiles(profs, family="academic")
        assert len(academic) > 0
        assert all(p.family == "academic" for p in academic)

        rr_profs = filter_profiles(profs, scheduler=SchedulerKind.RR)
        assert len(rr_profs) > 0
        assert all(p.scheduler == SchedulerKind.RR for p in rr_profs)

    def test_calendar_slot_matching(self):
        # Monday 09:00 (540 min) to 12:00 (720 min)
        slot = CalendarSlot(
            day_of_week=0,
            start_minute=540,
            end_minute=720,
            profile_name="practical_session"
        )
        assert slot.matches(540) is True
        assert slot.matches(600) is True
        assert slot.matches(719) is True
        assert slot.matches(720) is False
        assert slot.matches(539) is False
        # Tuesday (day 1, 1440 + 600 min)
        assert slot.matches(1440 + 600) is False

    def test_trigger_condition_evaluation(self):
        cond1 = TriggerCondition(field="queue_len", op=">=", value=5.0)
        assert cond1.evaluate({"queue_len": 5}) is True
        assert cond1.evaluate({"queue_len": 4}) is False

        cond2 = TriggerCondition(field="nodes_down", op=">", value=0.0)
        assert cond2.evaluate({"nodes_down": 1}) is True
        assert cond2.evaluate({"nodes_down": 0}) is False

        cond3 = TriggerCondition(field="queued_role_count[exam]", op=">=", value=2.0)
        assert cond3.evaluate({"queued_role_counts": {"exam": 3}}) is True
        assert cond3.evaluate({"queued_role_counts": {"exam": 1}}) is False

    def test_schedule_profile_switch_in_engine_run(self):
        rule = TriggerRule(
            priority=10,
            conditions=[TriggerCondition(field="nodes_down", op=">", value=0.0)],
            profile_name="node_failure",
            cooldown=0,
        )
        schedule = Schedule(
            slots=[],
            rules=[rule],
            default_profile_name="practical_session",
        )

        cluster = Cluster(
            nodes=[
                Node(id=1, name="n1", cpu=8, mem=16, up=True),
                Node(id=2, name="n2", cpu=8, mem=16, up=True),
            ],
            pooled=PooledResources(gpu=2, lic=2, io=2),
        )

        jobs = [
            Job(id="J1", user_id="u1", role=Role.ug, kind=JobKind.assignment,
                arrival=0, burst=50, cpu=4, mem=8),
            Job(id="J2", user_id="u2", role=Role.ug, kind=JobKind.assignment,
                arrival=10, burst=50, cpu=4, mem=8),
        ]

        node_events = [
            {"at": 20, "type": "NODE_DOWN", "node_id": 2},
        ]

        result = run(cluster, jobs, schedule, seed=42, record_events=True, node_events=node_events)
        
        switch_events = [e for e in result.events if e.get("type") == EventType.PROFILE_SWITCHED.value]
        assert len(switch_events) >= 1
        first_switch = switch_events[0]
        assert first_switch["to"] == "node_failure"
        assert first_switch["reason"] == "trigger"
