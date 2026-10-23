import React from 'react';
import { ScrubberBar } from '../components/ScrubberBar';
import { KpiStrip } from '../components/KpiStrip';
import { NodeGrid } from '../components/NodeGrid';
import { PooledGauges } from '../components/PooledGauges';
import { GanttChart } from '../components/GanttChart';
import { PolicyQueue } from '../components/PolicyQueue';
import { BankerPanel } from '../components/BankerPanel';
import { EventFeed } from '../components/EventFeed';
import { JobDrawer } from '../components/JobDrawer';
import { useLabStore } from '../store/useLabStore';

export const OverviewPage: React.FC = () => {
  const { mode } = useLabStore();

  return (
    <div className="flex flex-col flex-1 overflow-y-auto">
      {/* Precision Scrubber Bar (Simulation Mode) */}
      <ScrubberBar />

      {/* Top Telemetry KPI Strip */}
      <KpiStrip />

      {/* Main Mission Control Grid */}
      <div className="p-4 space-y-4 max-w-[1600px] w-full mx-auto">
        {/* Node Matrix & Pooled Gauges Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <NodeGrid />
          </div>
          <div>
            <PooledGauges />
          </div>
        </div>

        {/* Gantt Timeline (Sim Replay Mode) */}
        {mode === 'simulation' && <GanttChart />}

        {/* Policy Queue & Banker Safety Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PolicyQueue />
          <BankerPanel />
        </div>

        {/* Event Feed */}
        <EventFeed />
      </div>

      {/* Job Detailed Drawer */}
      <JobDrawer />
    </div>
  );
};
