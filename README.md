# LabQueue – Policy-Based Job Scheduling for Shared Compute Labs
**Operating Systems Capstone Project (OS-CBP)**

> A deterministic discrete-event simulation engine & real-process live resource manager for college compute clusters. Evaluates and compares **18 base policies (~600 concrete variants)** with memory placement, Dijkstra-Habermann Banker's deadlock avoidance, dynamic schedule calendar/triggers, and live process preemption with a mission-control dark projector dashboard.

---

## Highlights & Features

- **Discrete-Event Simulation Engine**:
  - Deterministic event loop benchmarked at **< 0.20s for 1,000 jobs**.
  - Event types: `JOB_SUBMITTED`, `JOB_DISPATCHED`, `JOB_PREEMPTED`, `JOB_RESUMED`, `JOB_COMPLETED`, `PHASE_REQUESTED`, `PHASE_GRANTED`, `DEADLOCK_DETECTED`, `DEADLOCK_RECOVERED`, `PROFILE_SWITCHED`, `NODE_FAILED`, `NODE_RESTORED`, and `STATE_SNAPSHOT`.
  - Invariant checked: No negative resources, conservation of CPU/memory/pooled assets, monotone clock progression.
- **18 Curated Base Policies & ~600 Concrete Variants**:
  - **Academic**: `practical_session` (RR-4, quota 2), `exam_week` (Priority deadline, exam reservation), `midterm_week`, `viva_demo`, `assignment_crunch` (SJF aging).
  - **Research**: `thesis_deadline` (Strict Banker's, large node reservation), `night_compute`, `weekend_batch`, `gpu_heavy_burst`, `quick_experiments`.
  - **Mixed / Campus Events**: `hackathon_crunch`, `workshop_day`, `maintenance_window`, `energy_saver`, `crisis_recovery`, `faculty_priority`, `role_reserved`, `strict_fairness`.
  - Comprehensive parameter sweep across Schedulers (FCFS, SJF, RR, PRIORITY), Placements (First, Best, Worst Fit), Banker Safety (Strict, Lenient, Off), Quantums ($2, 4, 8$), and Aging Rates ($0.0, 0.05, 0.1, 0.2$).
- **Deadlock Management & Safety Avoidance**:
  - **Dijkstra-Habermann Banker's Algorithm**: Allocation, Max Claim, Need, and Available vectors. Safe sequence path computation.
  - **Cycle Detection**: Wait-for graph analysis identifying cycles when Banker is turned off.
  - **Victim Selection & Recovery**: Preempts/terminates optimal victim (lowest priority score / latest arrival) and safely releases pooled and node assets.
- **Dynamic Scheduling (Calendar & Reactive Triggers)**:
  - Weekly recurring time slot painting (Monday practicals, Wednesday exams, Friday thesis overnight).
  - Structured condition triggers (e.g., IF `nodes_down >= 1` THEN switch to `node_failure_recovery`; IF `queue_len > 20` THEN switch to `exam_rush`).
- **Stage 9 Live Mode with Real OS Child Processes**:
  - Spawns real Python child processes (`cpu_burn.py`, `matrix_mult.py`, `prime_sieve.py`, `hash_files.py`, `monte_carlo_pi.py`, `sleep_io.py`).
  - Preempts via `psutil.Process.suspend()` (`SIGSTOP`) and resumes via `resume()` (`SIGCONT`). Never uses `shell=True`.
  - Live session persistence: saves live events to SQLite as a replayable simulation run.
- **Dark Mission-Control Dashboard**:
  - Precision timeline scrubber with Play/Pause, 1x/5x/20x/60x speeds, and Jump to Deadlock.
  - SVG Gantt chart with interactive job tracks and playhead tracking.
  - Real-time CPU and Memory gauges for large (16-core) vs standard (4-core) nodes.
  - Pooled resource radial gauges (GPUs, Software Licenses, Shared I/O slots).
  - Side-by-side Multi-Policy comparison matrix with metric deltas.
  - Interactive Custom Policy Builder with real-time schema validation.

---

## Two-Command Quick Start

### 1. Launch Backend Server & Built Dashboard
```bash
cd labqueue/backend
python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```
Open **[http://localhost:8000](http://localhost:8000)** in your browser!

### 2. (Optional) Run Frontend Dev Server with Hot-Reload
```bash
cd labqueue/frontend
npm run dev
```
Open **[http://localhost:5173](http://localhost:5173)** (automatically proxies API and WebSocket requests to port 8000).

---

## Verification & Test Suite

All **57 automated test cases** across Stages 0 through 9 pass in **~1.5 seconds**:

```bash
cd labqueue/backend
python3 -m pytest tests/ -v
```

Test breakdown:
- `test_stage0.py`: Models, PooledResources vector math, Node large check, Job phase parsing, and cluster invariants.
- `test_stage1.py`: FCFS deterministic discrete-event simulation, First/Best/Worst placement fits, makespan, and throughput.
- `test_stage2.py`: SJF/SRTF, Round-Robin quantum preemption, Priority scoring with aging, user quotas, and profile serialization.
- `test_stage3.py`: Textbook 5-process 3-resource Banker's algorithm, safe sequence generation, cross-demand deadlock detection, and recovery.
- `test_stage4.py`: 18 base profiles, ~600 combinatorial variants generator, calendar slot matching, and trigger-based policy switching.
- `test_stage5.py`: 6 Poisson workload generators, 1000-job performance target (< 0.5s), and FastAPI REST endpoints.
- `test_stage9.py`: Live process spawning, `psutil` suspend/resume preemption, LiveRunner lifecycle, and `/api/live/*` endpoints.

---

## Scripted 5-Minute Evaluation Demo

You can execute the automated CLI demo script:
```bash
cd labqueue/backend
python3 scripts/demo.py
```

### Walkthrough Steps for Presentation

1. **Step 1: Mission Control & Timeline Replay (Overview Tab)**:
   - Select scenario `exam_rush` and policy `practical_session` (FCFS/RR baseline).
   - Press **Play (or Space)** on the scrubber bar to watch jobs dispatch onto nodes in real time.
   - Point out the **Node Matrix** showing CPU/RAM utilization and the **SVG Gantt Chart** displaying active run intervals.
2. **Step 2: Multi-Policy Comparison (Multi-Compare Tab)**:
   - Compare `practical_session` vs `assignment_crunch` (SJF) vs `exam_week` (Priority Deadline).
   - Highlight the trade-off table:
     - **SJF** lowers average wait time from 312m down to 236m.
     - **Priority with Deadlines** ensures the exam student cohort experiences near-zero wait time (0.629 Jain's index specifically targeted to prioritize deadline-sensitive jobs).
3. **Step 3: Banker's Algorithm & Deadlock Avoidance (Banker Panel)**:
   - Observe policy with `banker: off`: when cross-demands for GPU and Software Licenses occur, a deadlock cycle is detected and a victim job is terminated and restarted.
   - Switch to `banker: strict`: Dijkstra's safety algorithm detects that granting the second resource leaves no safe sequence, deferring the request and avoiding deadlocks completely.
4. **Step 4: Calendar & Reactive Outage Triggers (Calendar Tab)**:
   - Review weekly scheduled blocks (practicals during the day, thesis runs overnight).
   - Show reactive trigger: when `nodes_down >= 1`, the cluster automatically switches to `node_failure_recovery` policy.
5. **Step 5: Live OS Process Dispatch & Preemption (Live Console Tab)**:
   - Switch to **Live OS Mode**.
   - Submit a real Python worker (`matrix_mult.py` or `prime_sieve.py`).
   - Click **Inject Burst** to spawn 5 concurrent worker processes.
   - Point to the **Active OS Child Processes** table showing real PIDs, CPU %, and memory RSS.
   - Hot-switch policy to `practical_session` (RR-4) and observe processes being suspended (`SIGSTOP`) and resumed (`SIGCONT`) when quantum expires.
