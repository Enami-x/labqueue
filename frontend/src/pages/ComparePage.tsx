import React, { useEffect } from 'react';
import { useLabStore } from '../store/useLabStore';
import { GitCompareArrows, Play, X } from 'lucide-react';
import { Profile, RunMetrics, RunResult } from '../types';
import { ProfilePicker } from '../components/ProfilePicker';
import { BusyIcon, EmptyState, Field, PageHeader, SectionHeading, Skeleton } from '../components/ui';
import { fmtDuration, fmtPct, profileLabel } from '../lib/format';

interface Insight {
  title: string;
  body: string;
}

const fmtMin = (v: number) => fmtDuration(v, 'min', 1);

/** Plain-language findings derived from the runs actually on screen. */
export function computeInsights(runs: RunResult[], profilesByName: Record<string, Profile>): Insight[] {
  if (runs.length < 2) return [];
  const [base, ...others] = runs;
  const b = base.metrics;
  const insights: Insight[] = [];

  const bestWait = [...others].sort((x, y) => x.metrics.avg_wait - y.metrics.avg_wait)[0];
  const waitDelta = bestWait.metrics.avg_wait - b.avg_wait;
  if (waitDelta < 0) {
    const pct = b.avg_wait > 0 ? ` (${Math.round((-waitDelta / b.avg_wait) * 100)}%)` : '';
    insights.push({
      title: 'Average wait',
      body: `${bestWait.profile_name} cut average wait by ${fmtMin(-waitDelta)}${pct} vs ${base.profile_name} (${fmtMin(b.avg_wait)} → ${fmtMin(bestWait.metrics.avg_wait)}).`,
    });
  } else {
    insights.push({
      title: 'Average wait',
      body: `No policy beat the baseline ${base.profile_name} (${fmtMin(b.avg_wait)}). The closest was ${bestWait.profile_name} at ${fmtMin(bestWait.metrics.avg_wait)}.`,
    });
  }

  const byFair = [...runs].sort((x, y) => y.metrics.jains_fairness - x.metrics.jains_fairness);
  const [fairest, leastFair] = [byFair[0], byFair[byFair.length - 1]];
  insights.push({
    title: 'Fairness',
    body:
      fairest.metrics.jains_fairness - leastFair.metrics.jains_fairness < 0.005
        ? `All policies are about equally fair here (Jain's index ≈ ${fairest.metrics.jains_fairness.toFixed(3)}).`
        : `${fairest.profile_name} is the fairest (Jain's ${fairest.metrics.jains_fairness.toFixed(3)}); ${leastFair.profile_name} is the least fair (${leastFair.metrics.jains_fairness.toFixed(3)}).`,
  });

  const withDeadlocks = runs.filter((r) => r.metrics.deadlocks_detected > 0);
  if (withDeadlocks.length) {
    insights.push({
      title: 'Deadlocks',
      body:
        withDeadlocks
          .map((r) => {
            const n = r.metrics.deadlocks_detected;
            return `${r.profile_name} hit ${n} deadlock${n === 1 ? '' : 's'} (Banker ${profilesByName[r.profile_name]?.banker ?? '?'})`;
          })
          .join('; ') + '.',
    });
  } else {
    const denials = runs.reduce((n, r) => n + r.metrics.banker_denials, 0);
    insights.push({
      title: 'Deadlocks',
      body: `No deadlocks in any run. The Banker's algorithm refused ${denials} unsafe request${denials === 1 ? '' : 's'} across these policies.`,
    });
  }
  return insights;
}

type Col = { key: keyof RunMetrics; label: string; fmt: (v: number) => string; lowerIsBetter: boolean };
const COLUMNS: Col[] = [
  { key: 'avg_wait', label: 'Avg wait', fmt: fmtMin, lowerIsBetter: true },
  { key: 'p99_wait', label: 'P99 wait', fmt: fmtMin, lowerIsBetter: true },
  { key: 'makespan', label: 'Makespan', fmt: (v) => fmtDuration(v, 'min', 0), lowerIsBetter: true },
  { key: 'jains_fairness', label: "Jain's fairness", fmt: (v) => v.toFixed(3), lowerIsBetter: false },
  { key: 'cpu_util_avg', label: 'CPU util', fmt: (v) => fmtPct(v, 1), lowerIsBetter: false },
  { key: 'deadlocks_detected', label: 'Deadlocks', fmt: (v) => String(v), lowerIsBetter: true },
  { key: 'starved_jobs', label: 'Starved', fmt: (v) => String(v), lowerIsBetter: true },
];

const Delta: React.FC<{ col: Col; value: number; base: number }> = ({ col, value, base }) => {
  const d = value - base;
  if (Math.abs(d) < 1e-9) return <span className="delta">±0</span>;
  const better = col.lowerIsBetter ? d < 0 : d > 0;
  const shown = col.key === 'cpu_util_avg' ? `${(d * 100).toFixed(1)} pt` : col.key === 'jains_fairness' ? d.toFixed(3) : d.toFixed(col.key === 'avg_wait' || col.key === 'p99_wait' ? 1 : 0);
  return (
    <span className={`delta ${better ? 'better' : 'worse'}`} title={better ? 'better than baseline' : 'worse than baseline'}>
      {d > 0 ? '▲ +' : '▼ '}
      {shown}
      <span className="sr-only">{better ? ', better than baseline' : ', worse than baseline'}</span>
    </span>
  );
};

export const ComparePage: React.FC = () => {
  const {
    profiles,
    compareProfileNames,
    toggleCompareProfile,
    addCompareProfile,
    compareRuns,
    compareScenario,
    compareLoading,
    runCompareBatch,
    activeScenario,
    scenarios,
    setActiveScenario,
  } = useLabStore();

  useEffect(() => {
    if (Object.keys(compareRuns).length === 0) runCompareBatch();
  }, []);

  const profilesByName = Object.fromEntries(profiles.map((p) => [p.name, p]));
  const runsList = compareProfileNames.map((n) => compareRuns[n]).filter(Boolean) as RunResult[];
  const stale =
    compareScenario !== activeScenario || compareProfileNames.some((n) => !compareRuns[n]) || runsList.length < 2;
  const baseline = runsList[0]?.metrics;
  const insights = stale ? [] : computeInsights(runsList, profilesByName);

  return (
    <div>
      <PageHeader
        kicker="Policy comparison"
        title={
          <>
            Compare policies<span>.</span>
          </>
        }
        description={
          <>
            Run two to four profiles on the same workload and seed. The first profile is the baseline for every delta.
            Times are simulated minutes.
          </>
        }
        actions={
          <button className="primary-button" onClick={runCompareBatch} disabled={compareLoading}>
            <BusyIcon busy={compareLoading} icon={<Play />} />
            {compareLoading ? 'Running…' : 'Run comparison'}
          </button>
        }
      />

      <div className="stack">
        <section className="panel" aria-labelledby="cmp-select">
          <SectionHeading id="cmp-select" kicker="Setup" title="Policies and workload" />
          <div className="panel-body stack" style={{ gap: 16 }}>
            <div className="flex flex-wrap gap-2" aria-label="Selected policies">
              {compareProfileNames.map((n, i) => (
                <span key={n} className={`chip ${i === 0 ? '' : 'neutral'}`}>
                  {i === 0 && <b>Baseline ·</b>} {profileLabel(n)}
                  <button
                    onClick={() => toggleCompareProfile(n)}
                    aria-label={`Remove ${n} from comparison`}
                    style={{ border: 0, background: 'transparent', color: 'inherit', display: 'grid', placeItems: 'center' }}
                  >
                    <X />
                  </button>
                </span>
              ))}
            </div>
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
              <Field label="Add a policy" hint={`${compareProfileNames.length} of 4 selected`}>
                {(id, d) => (
                  <ProfilePicker
                    id={id}
                    describedBy={d}
                    value=""
                    placeholder="Search profiles to add…"
                    disabled={compareProfileNames.length >= 4}
                    filter={(p) => !compareProfileNames.includes(p.name)}
                    onChange={addCompareProfile}
                  />
                )}
              </Field>
              <Field label="Workload scenario">
                {(id) => (
                  <select id={id} className="control" value={activeScenario} onChange={(e) => setActiveScenario(e.target.value)}>
                    {scenarios.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </div>
          </div>
        </section>

        <section className="panel" aria-labelledby="cmp-results" aria-busy={compareLoading}>
          <SectionHeading
            id="cmp-results"
            kicker={compareScenario ? `Scenario ${compareScenario}` : 'Results'}
            title="Results and deltas"
            actions={stale && !compareLoading && runsList.length > 0 ? <span className="chip warn">Setup changed: run again</span> : undefined}
          />
          <div className="panel-body">
            {compareLoading && runsList.length === 0 ? (
              <div className="stack" style={{ gap: 10 }}>
                {compareProfileNames.map((n) => (
                  <Skeleton key={n} height={38} />
                ))}
              </div>
            ) : runsList.length === 0 ? (
              <EmptyState icon={<GitCompareArrows />} action={<button className="primary-button" onClick={runCompareBatch}>Run comparison</button>}>
                No results yet.
              </EmptyState>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <caption className="help" style={{ captionSide: 'bottom', textAlign: 'left', paddingTop: 10 }}>
                    Deltas are against the baseline: ▲/▼ is the direction of change; mint means better, orange means worse.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Policy</th>
                      <th scope="col">Scheduler</th>
                      {COLUMNS.map((c) => (
                        <th key={c.key} scope="col" className="num">
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {runsList.map((run, idx) => (
                      <tr key={run.profile_name}>
                        <th scope="row">
                          {profileLabel(run.profile_name)} {idx === 0 && <span className="chip neutral">baseline</span>}
                        </th>
                        <td>{profilesByName[run.profile_name]?.scheduler ?? '—'}</td>
                        {COLUMNS.map((c) => {
                          const v = Number(run.metrics[c.key] ?? 0);
                          return (
                            <td key={c.key} className="num">
                              {c.fmt(v)}
                              {idx > 0 && baseline && <Delta col={c} value={v} base={Number(baseline[c.key] ?? 0)} />}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {insights.length > 0 && (
          <section aria-labelledby="cmp-insights">
            <h2 id="cmp-insights" className="section-kicker" style={{ margin: '4px 0 12px' }}>
              What changed
            </h2>
            <div className="grid-3">
              {insights.map((ins) => (
                <div key={ins.title} className="panel insight">
                  <b>{ins.title}</b>
                  <p>{ins.body}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
