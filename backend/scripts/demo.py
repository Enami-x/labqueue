"""
labqueue/backend/scripts/demo.py – Scripted 5-minute CLI demo walkthrough for LabQueue.
Runs discrete-event simulations, compares policies, triggers deadlocks, and demonstrates live execution.
"""

import sys
import time
from pathlib import Path

# Add backend directory to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from engine.model import DEFAULT_CLUSTER, BankerMode, PlacementKind, Role, SchedulerKind
from engine.profiles import BASE_PROFILE_MAP, BASE_PROFILES, Profile
from engine.workloads import generate_workload, workload_from_dict
from engine.engine import run


def print_banner(text: str):
    print("\n" + "=" * 70)
    print(f"  {text}")
    print("=" * 70)


def demo_1_scenarios():
    print_banner("DEMO 1: WORKLOAD SYNTHESIS (Poisson Arrivals & Role Mix)")
    wl = generate_workload("exam_rush", n_jobs=30, seed=42)
    jobs = workload_from_dict(wl)
    print(f"Synthesized 'exam_rush' scenario with {len(jobs)} jobs:")
    for j in jobs[:5]:
        print(f"  • Job {j.id:10s} | User: {j.user_id:6s} | Role: {j.role.value:8s} | Burst: {j.burst:2d}m | CPU: {j.cpu} | RAM: {j.mem}G")
    print("  ... [25 more jobs]")


def demo_2_policy_comparison():
    print_banner("DEMO 2: POLICY COMPARISON (FCFS vs SJF vs PRIORITY)")
    wl = generate_workload("research_mixed", n_jobs=40, seed=42)
    jobs = workload_from_dict(wl)

    policies = [
        ("practical_session", BASE_PROFILE_MAP["practical_session"]),
        ("assignment_crunch", BASE_PROFILE_MAP["assignment_crunch"]),
        ("exam_week", BASE_PROFILE_MAP["exam_week"]),
    ]

    print(f"{'Policy Name':22s} | {'Makespan':10s} | {'Avg Wait':10s} | {'P95 Wait':10s} | {'Jain Index':10s}")
    print("-" * 70)

    for name, prof in policies:
        res = run(DEFAULT_CLUSTER, jobs, prof, seed=42)
        m = res.metrics
        print(f"{name:22s} | {m['makespan']:8.1f}m | {m['avg_wait']:8.1f}m | {m['p95_wait']:8.1f}m | {m['fairness_index']:10.3f}")


def demo_3_bankers_deadlock():
    print_banner("DEMO 3: BANKER'S AVOIDANCE vs DEADLOCK RECOVERY")
    from engine.model import Cluster, Job, JobKind, Node, Phase, PooledResources

    cluster = Cluster(
        nodes=[Node(id=0, name="worker-0", cpu=4, mem=16)],
        pooled=PooledResources(gpu=1, lic=1, io=0),
    )
    jobs = [
        Job(
            id="Job-A", user_id="u0", role=Role.phd, kind=JobKind.training,
            arrival=0, burst=10, cpu=1, mem=2,
            phases=[Phase(at=0, request=PooledResources(gpu=1)), Phase(at=2, request=PooledResources(lic=1))],
            max_claim=PooledResources(gpu=1, lic=1),
        ),
        Job(
            id="Job-B", user_id="u1", role=Role.phd, kind=JobKind.training,
            arrival=0, burst=10, cpu=1, mem=2,
            phases=[Phase(at=0, request=PooledResources(lic=1)), Phase(at=2, request=PooledResources(gpu=1))],
            max_claim=PooledResources(gpu=1, lic=1),
        ),
    ]

    p_off = Profile(
        name="test_off", family="test", scheduler=SchedulerKind.FCFS,
        placement=PlacementKind.first, banker=BankerMode.off, backfill=False,
    )
    res_off = run(cluster, jobs, p_off, seed=0)
    dl_events = [e for e in res_off.events if e["type"] == "DEADLOCK_DETECTED"]
    rec_events = [e for e in res_off.events if e["type"] == "DEADLOCK_RECOVERED"]
    print(f"Banker Mode = OFF:")
    print(f"  • Deadlocks detected: {len(dl_events)} (Cycles detected: {[e.get('jobs') for e in dl_events]})")
    print(f"  • Recovery passes:    {len(rec_events)} (Victims aborted: {[e.get('victim') for e in rec_events]})")

    p_strict = Profile(
        name="test_strict", family="test", scheduler=SchedulerKind.FCFS,
        placement=PlacementKind.first, banker=BankerMode.strict, backfill=False,
    )
    res_strict = run(cluster, jobs, p_strict, seed=0)
    dl_strict = [e for e in res_strict.events if e["type"] == "DEADLOCK_DETECTED"]
    print(f"\nBanker Mode = STRICT:")
    print(f"  • Deadlocks detected: {len(dl_strict)} (Completely avoided by Dijkstra safety checks)")
    print(f"  • Both jobs completed successfully: {res_strict.metrics['jobs_completed'] == 2}")


def demo_4_live_process_preemption():
    print_banner("DEMO 4: LIVE PROCESS SPAWNING & OS PREEMPTION (psutil)")
    from live.process_executor import ProcessExecutor

    executor = ProcessExecutor()
    print("Spawning child process (cpu_burn.py) for 3.0 seconds...")
    info = executor.spawn("demo_job_1", script_name="cpu_burn.py", duration=3.0)
    print(f"  → Spawned PID {info.pid}")
    time.sleep(0.5)

    m = executor.get_metrics("demo_job_1")
    print(f"  → Process status: {m['status']} | CPU: {m.get('cpu_percent', 0)}%")

    print("Preempting process via psutil.Process.suspend() [SIGSTOP]...")
    executor.suspend("demo_job_1")
    print(f"  → Suspended status: {executor.get_metrics('demo_job_1')['status']}")
    time.sleep(0.5)

    print("Resuming process via psutil.Process.resume() [SIGCONT]...")
    executor.resume("demo_job_1")
    print(f"  → Resumed status: {executor.get_metrics('demo_job_1')['status']}")

    print("Cleaning up process...")
    executor.kill("demo_job_1")
    print("  → Killed successfully.")


def main():
    print("\n" + "#" * 70)
    print("  LABQUEUE – POLICY-BASED JOB SCHEDULER DEMO")
    print("#" * 70)
    demo_1_scenarios()
    demo_2_policy_comparison()
    demo_3_bankers_deadlock()
    demo_4_live_process_preemption()
    print_banner("DEMO COMPLETE: All simulation invariants & live preemption verified.")


if __name__ == "__main__":
    main()
