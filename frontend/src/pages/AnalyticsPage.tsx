import React, { useMemo, useRef, useState } from 'react';
import { useLabStore } from '../store/useLabStore';
import { BarChart3 } from 'lucide-react';
import { EmptyState, PageHeader, SectionHeading } from '../components/ui';
import { fmtDuration, fmtPct, profileLabel, ROLE_LABEL, unitOf } from '../lib/format';

const W = 640;
const H = 200;
const PAD = { l: 44, r: 12, t: 12, b: 26 };

/** Single-series line chart with a hover crosshair and tooltip. */
const LineChart: React.FC<{
  xs: number[];
  ys: number[];
  yMax?: number;
  yFmt: (v: number) => string;
  xFmt: (v: number) => string;
  label: string;
  step?: boolean;
  /** Counts: keep y ticks on whole numbers. */
  integer?: boolean;
}> = ({ xs, ys, yMax, yFmt, xFmt, label, step, integer }) => {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const x0 = xs[0] ?? 0;
  const x1 = Math.max(x0 + 1, xs[xs.length - 1] ?? 1);
  const top = yMax ?? Math.max(1, ...ys);
  const sx = (x: number) => PAD.l + ((x - x0) / (x1 - x0)) * (W - PAD.l - PAD.r);
  const sy = (y: number) => PAD.t + (1 - y / top) * (H - PAD.t - PAD.b);

  const path = ys
    .map((y, i) => {
      const p = `${sx(xs[i]).toFixed(1)},${sy(y).toFixed(1)}`;
      if (i === 0) return `M${p}`;
      return step ? `H${sx(xs[i]).toFixed(1)}V${sy(y).toFixed(1)}` : `L${p}`;
    })
    .join('');
  const yTicks = integer ? Array.from(new Set([0, Math.round(top / 2), top])) : [0, top / 2, top];
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => x0 + f * (x1 - x0));

  const onMove = (e: React.MouseEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || xs.length === 0) return;
    const x = x0 + ((((e.clientX - rect.left) / rect.width) * W - PAD.l) / (W - PAD.l - PAD.r)) * (x1 - x0);
    let best = 0;
    for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - x) < Math.abs(xs[best] - x)) best = i;
    setHover(best);
  };

  return (
    <div className="chart">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {yTicks.map((t, i) => (
          <g key={i}>
            <line className="grid-line" x1={PAD.l} x2={W - PAD.r} y1={sy(t)} y2={sy(t)} />
            <text className="axis-label" x={PAD.l - 8} y={sy(t) + 4} textAnchor="end">
              {yFmt(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <text key={i} className="axis-label" x={sx(t)} y={H - 6} textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}>
            {xFmt(t)}
          </text>
        ))}
        <path d={path} fill="none" stroke="#75d7a0" strokeWidth={2} strokeLinejoin="round" />
        {hover !== null && (
          <g>
            <line x1={sx(xs[hover])} x2={sx(xs[hover])} y1={PAD.t} y2={H - PAD.b} stroke="rgba(245,244,237,0.35)" strokeWidth={1} />
            <circle cx={sx(xs[hover])} cy={sy(ys[hover])} r={4.5} fill="#75d7a0" stroke="#072b24" strokeWidth={2} />
          </g>
        )}
        <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} fill="transparent" />
      </svg>
      {hover !== null && (
        <div className="chart-tooltip" style={{ left: `${(sx(xs[hover]) / W) * 100}%`, top: `${(sy(ys[hover]) / H) * 100}%` }}>
          {xFmt(xs[hover])} · <b>{yFmt(ys[hover])}</b>
        </div>
      )}
    </div>
  );
};

export const AnalyticsPage: React.FC = () => {
  const { runResult, activeScenario, replayState, setTab } = useLabStore();
  const m = runResult?.metrics;
  const unit = unitOf(runResult);
  const [showTable, setShowTable] = useState(false);

  const roleRows = useMemo(
    () =>
      Object.entries(m?.by_role || {})
        .filter(([, r]) => r.count > 0)
        .sort((a, b) => b[1].avg_wait - a[1].avg_wait),
    [m],
  );

  if (!m) {
    return (
      <div>
        <PageHeader kicker="Run analytics" title="Analytics" />
        <div className="grid-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 130 }} />
          ))}
        </div>
      </div>
    );
  }

  const maxWait = Math.max(1, ...roleRows.map(([, r]) => r.avg_wait));
  const ts = m.time_series;
  const hasTs = !!ts && ts.t.length > 1;
  const tailRatio = m.avg_wait > 0 ? m.p99_wait / m.avg_wait : null;
  const policy = runResult?.profile_name === 'calendar_schedule' ? 'the calendar schedule' : profileLabel(runResult?.profile_name ?? '');

  return (
    <div>
      <PageHeader
        kicker="Run analytics"
        title={
          <>
            Analytics<span>.</span>
          </>
        }
        description={
          <>
            Results for <b>{policy}</b> on <b>{activeScenario}</b>: {m.jobs_completed} of {m.total_jobs} jobs completed in{' '}
            {fmtDuration(m.makespan, unit, 0)}.
          </>
        }
        actions={
          <button className="ghost-button" style={{ padding: '9px 14px' }} onClick={() => setTab('compare')}>
            Compare with other policies
          </button>
        }
      />

      <div className="stack">
        <section className="metrics-grid" style={{ width: '100%', marginTop: 0 }} aria-label="Headline metrics">
          <div className="metric-card">
            <div className="metric-label">Jain's fairness</div>
            <div className="metric-value positive">{m.jains_fairness.toFixed(3)}</div>
            <div className="metric-detail">over per-user slowdown; 1 = perfectly fair</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Tail ratio (P99 ÷ mean)</div>
            <div className="metric-value">{tailRatio === null ? '—' : `${tailRatio.toFixed(1)}×`}</div>
            <div className="metric-detail">
              P99 {fmtDuration(m.p99_wait, unit)} vs mean {fmtDuration(m.avg_wait, unit)}
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Starved jobs</div>
            <div className={`metric-value ${m.starved_jobs ? 'warning' : ''}`}>{m.starved_jobs}</div>
            <div className="metric-detail">waited more than 120 {unit} to start</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Deadline misses</div>
            <div className={`metric-value ${m.deadline_misses ? 'warning' : ''}`}>{m.deadline_misses}</div>
            <div className="metric-detail">{fmtPct(m.deadline_miss_rate, 0)} of jobs with a deadline</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Preemptions</div>
            <div className="metric-value">{m.preemptions}</div>
            <div className="metric-detail">{m.restarts} restarts after kills</div>
          </div>
        </section>

        <section className="panel" aria-labelledby="an-roles">
          <SectionHeading id="an-roles" kicker="Wait time by role" title="Who waits longest" />
          <div className="panel-body">
            {roleRows.length === 0 ? (
              <EmptyState icon={<BarChart3 />}>No completed jobs in this run.</EmptyState>
            ) : (
              <div role="table" aria-label="Average wait by role">
                {roleRows.map(([role, r]) => (
                  <div className="bar-row" role="row" key={role}>
                    <span role="rowheader">
                      {ROLE_LABEL[role] ?? role} <small>· {r.count} jobs</small>
                    </span>
                    <span role="cell" className="bar-track" aria-hidden="true">
                      <span className="bar-fill" style={{ display: 'block', width: `${Math.max(1, (r.avg_wait / maxWait) * 100)}%` }} />
                    </span>
                    <span role="cell" className="bar-value" title={`P95 ${fmtDuration(r.p95_wait, unit)} · max ${fmtDuration(r.max_wait, unit)}`}>
                      {fmtDuration(r.avg_wait, unit)}
                    </span>
                  </div>
                ))}
                <p className="help" style={{ marginTop: 8 }}>
                  Average wait from arrival to first start. Roles with no completed jobs are hidden.
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="panel" aria-labelledby="an-ts">
          <SectionHeading
            id="an-ts"
            kicker={`Sampled about every 5 ${unit} of simulated time`}
            title="Queue and utilization over time"
            actions={
              hasTs ? (
                <button className="ghost-button" style={{ padding: '7px 12px' }} aria-expanded={showTable} onClick={() => setShowTable((v) => !v)}>
                  {showTable ? 'Show charts' : 'Show data table'}
                </button>
              ) : undefined
            }
          />
          <div className="panel-body">
            {!hasTs ? (
              <EmptyState icon={<BarChart3 />}>
                No time series for this run{unit === 's' ? ' (saved live sessions are not sampled)' : ''}.
              </EmptyState>
            ) : showTable ? (
              <div className="table-wrap" style={{ maxHeight: 360, overflowY: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col" className="num">Time</th>
                      <th scope="col" className="num">Queue length</th>
                      <th scope="col" className="num">CPU utilization</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ts!.t.map((t, i) => (
                      <tr key={i}>
                        <td className="num">T+{t}m</td>
                        <td className="num">{ts!.queue_len[i]}</td>
                        <td className="num">{fmtPct(ts!.utilization[i], 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid-2">
                <div>
                  <div className="field-label" style={{ marginBottom: 8 }}>
                    Jobs waiting in the ready queue
                  </div>
                  <LineChart
                    xs={ts!.t}
                    ys={ts!.queue_len}
                    step
                    integer
                    label="Ready-queue length over simulated time"
                    yFmt={(v) => (Number.isInteger(v) ? String(v) : v.toFixed(1))}
                    xFmt={(v) => `T+${Math.round(v)}m`}
                  />
                </div>
                <div>
                  <div className="field-label" style={{ marginBottom: 8 }}>
                    CPU allocated (share of up nodes)
                  </div>
                  <LineChart
                    xs={ts!.t}
                    ys={ts!.utilization}
                    yMax={1}
                    label="CPU utilization over simulated time"
                    yFmt={(v) => fmtPct(v, 0)}
                    xFmt={(v) => `T+${Math.round(v)}m`}
                  />
                </div>
              </div>
            )}
            {replayState && hasTs && (
              <p className="help" style={{ marginTop: 10 }}>
                Peak queue {Math.max(...ts!.queue_len)} job{Math.max(...ts!.queue_len) === 1 ? '' : 's'} · mean CPU allocated{' '}
                {fmtPct(ts!.utilization.reduce((a, b) => a + b, 0) / ts!.utilization.length, 0)}.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
