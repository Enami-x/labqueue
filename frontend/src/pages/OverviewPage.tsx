import React from 'react';
import { useLabStore } from '../store/useLabStore';
import { ScrubberBar } from '../components/ScrubberBar';
import { KpiStrip } from '../components/KpiStrip';
import { NodeGrid } from '../components/NodeGrid';
import { PooledGauges } from '../components/PooledGauges';
import { GanttChart } from '../components/GanttChart';
import { PolicyQueue } from '../components/PolicyQueue';
import { EventFeed } from '../components/EventFeed';
import { BankerPanel } from '../components/BankerPanel';
import { ChevronDown, Terminal, Gauge } from 'lucide-react';
import { profileLabel } from '../lib/format';

const LINK = { open: 'connected', connecting: 'connecting…', reconnecting: 'reconnecting…' };

export const OverviewPage: React.FC = () => {
  const { mode, activeScenario, activeProfile, scenarios, runSimulation, loading, replayState, runResult, liveState, liveLink } =
    useLabStore();
  const live = mode === 'live';

  const policy = live
    ? liveState?.profile ?? '—'
    : replayState?.active_profile_name || activeProfile;
  const runLabel = !live && runResult?.profile_name === 'calendar_schedule' ? 'calendar schedule' : null;
  const savedLive = runResult?.metrics?.time_unit === 's';

  return (
    <div className="flex flex-col flex-1 pb-12">
      <section className="hero-head">
        <div>
          <div className="eyebrow">
            <span className="pulse" aria-hidden="true" />
            {live ? `Live OS mode · ${LINK[liveLink]}` : savedLive ? 'Replay of a saved live session' : 'Simulation replay'}
          </div>
          <h1>
            Mission control<span>.</span>
          </h1>
          <p>Observe every job, resource, and policy decision across your compute cluster.</p>
        </div>

        {!live && (
          <div className="scenario-control">
            <label className="control-label" htmlFor="scenario-select">
              Active scenario
            </label>
            <div className="relative">
              <select
                id="scenario-select"
                value={activeScenario}
                onChange={(e) => runSimulation(activeProfile, e.target.value)}
                disabled={loading}
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
        )}
      </section>

      <ScrubberBar />
      <KpiStrip />

      <div className="content-grid">
        <NodeGrid />
        <PooledGauges />
      </div>

      <div className="lower-grid">
        <GanttChart />
        <PolicyQueue />
      </div>

      <div className="banker-grid">
        <BankerPanel />
      </div>

      <EventFeed />

      <footer className="footer">
        <span>LabQueue · v1.0</span>
        <span>
          <Terminal aria-hidden="true" /> {live ? 'Real OS processes, 1 profile minute = 1 second' : 'Discrete-event simulation, times in minutes'}
        </span>
        <span>
          <Gauge aria-hidden="true" /> Active policy: {profileLabel(policy)}
          {runLabel ? ` (via ${runLabel})` : ''}
        </span>
      </footer>
    </div>
  );
};
