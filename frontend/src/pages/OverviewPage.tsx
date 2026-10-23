import React from 'react';
import { useLabStore } from '../store/useLabStore';
import { ScrubberBar } from '../components/ScrubberBar';
import { KpiStrip } from '../components/KpiStrip';
import { NodeGrid } from '../components/NodeGrid';
import { PooledGauges } from '../components/PooledGauges';
import { GanttChart } from '../components/GanttChart';
import { PolicyQueue } from '../components/PolicyQueue';
import { EventFeed } from '../components/EventFeed';
import { JobDrawer } from '../components/JobDrawer';
import { ChevronDown, Terminal, Gauge } from 'lucide-react';

export const OverviewPage: React.FC = () => {
  const {
    mode,
    activeScenario,
    activeProfile,
    scenarios,
    runSimulation,
    loading,
    replayState,
  } = useLabStore();

  const activePolicyName = replayState?.active_profile_name || activeProfile || 'practical_session';

  return (
    <div className="flex flex-col flex-1 pb-12">
      {/* Hero Header */}
      <section className="hero-head">
        <div>
          <div className="eyebrow">
            <span className="pulse" />
            {mode === 'simulation' ? 'Simulation replay' : 'Live OS mode'} · connected
          </div>
          <h1>
            Mission control<span>.</span>
          </h1>
          <p>
            Observe every job, resource, and policy decision across your compute cluster.
          </p>
        </div>

        <div className="scenario-control">
          <span className="control-label">Active scenario</span>
          <div className="relative">
            <select
              value={activeScenario}
              onChange={(e) => runSimulation(activeProfile, e.target.value)}
              disabled={loading}
              aria-label="Active Workload Scenario"
              className="scenario-button appearance-none pr-8 cursor-pointer"
            >
              {scenarios.map((s) => (
                <option key={s} value={s} className="bg-[#031f1b] text-[#f5f4ed]">
                  {s}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none text-[#91b8a8]" />
          </div>
        </div>
      </section>

      {/* Scrubber Transport Bar */}
      <ScrubberBar />

      {/* KPI Metrics Grid */}
      <KpiStrip />

      {/* Upper Content Grid: Nodes & Pooled Gauges */}
      <div className="content-grid">
        <NodeGrid />
        <PooledGauges />
      </div>

      {/* Lower Content Grid: Gantt Timeline & Ready Queue */}
      <div className="lower-grid">
        <GanttChart />
        <PolicyQueue />
      </div>

      {/* Event Feed */}
      <EventFeed />

      {/* Footer */}
      <footer className="footer">
        <span>LabQueue OS · v1.0</span>
        <span>
          <Terminal /> Real-time discrete-event simulation
        </span>
        <span>
          <Gauge /> Active policy: {activePolicyName}
        </span>
      </footer>

      {/* Slide-over Job Inspector */}
      <JobDrawer />
    </div>
  );
};
