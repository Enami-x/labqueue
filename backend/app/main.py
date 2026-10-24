"""
app/main.py – FastAPI application entry point.
"""

from __future__ import annotations

import json
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db import init_db
from app.api import profiles, workloads, runs, calendar, live
from app.api.live import get_live_runner
from fastapi import WebSocket, WebSocketDisconnect

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    _seed_db()
    runner = get_live_runner()
    await runner.start()
    try:
        yield
    finally:
        await runner.stop()


app = FastAPI(
    title="LabQueue API",
    description="Policy-Based Job Scheduling for Shared Compute Labs",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(profiles.router)
app.include_router(workloads.router)
app.include_router(runs.router)
app.include_router(calendar.router)
app.include_router(live.router)


def _seed_db():
    """Seed default cluster, scenarios, and base profiles into DB."""
    from sqlmodel import Session, select
    from app.db import engine, ProfileRecord, WorkloadRecord
    from engine.profiles import BASE_PROFILES
    from engine.workloads import generate_workload

    with Session(engine) as session:
        # Seed base profiles if not present
        for p in BASE_PROFILES:
            existing = session.exec(
                select(ProfileRecord).where(ProfileRecord.name == p.name)
            ).first()
            if not existing:
                rec = ProfileRecord(
                    name=p.name, family=p.family,
                    data=p.to_json(), is_custom=False,
                )
                session.add(rec)

        # Seed a default workload for each scenario
        from engine.workloads import SCENARIOS
        for sname in SCENARIOS:
            existing = session.exec(
                select(WorkloadRecord).where(WorkloadRecord.scenario == sname)
            ).first()
            if not existing:
                wl = generate_workload(sname, seed=42)
                rec = WorkloadRecord(
                    scenario=sname, seed=42, data=json.dumps(wl)
                )
                session.add(rec)

        session.commit()


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "1.0.0"}


@app.get("/api/cluster")
def get_cluster():
    from engine.model import DEFAULT_CLUSTER
    return DEFAULT_CLUSTER.model_dump()


@app.websocket("/ws/live")
async def websocket_live_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time live events and cluster state updates.
    """
    await websocket.accept()
    runner = get_live_runner()
    queue = runner.subscribe()

    try:
        # Send initial snapshot immediately upon connect
        init_state = runner.get_full_state()
        await websocket.send_text(json.dumps({"type": "INIT_STATE", "data": init_state}, default=str))

        while True:
            evt = await queue.get()
            await websocket.send_text(json.dumps(evt, default=str))
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        runner.unsubscribe(queue)


from pathlib import Path
from fastapi.staticfiles import StaticFiles

FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")


