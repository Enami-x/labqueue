import React, { useState } from 'react';
import { useLabStore } from '../store/useLabStore';
import { api, GeneratedWorkload } from '../services/api';
import { Download, FlaskConical, Play, Search } from 'lucide-react';
import { ProfilePicker } from '../components/ProfilePicker';
import { BusyIcon, EmptyState, Field, PageHeader, SectionHeading } from '../components/ui';
import { toast } from '../store/useFeedback';
import { ROLE_LABEL } from '../lib/format';

const PREVIEW_ROWS = 25;
const claim = (c?: { gpu: number; lic: number; io: number }) =>
  !c || c.gpu + c.lic + c.io === 0 ? '—' : [c.gpu && `${c.gpu} GPU`, c.lic && `${c.lic} lic`, c.io && `${c.io} I/O`].filter(Boolean).join(' · ');

export const ScenarioLabPage: React.FC = () => {
  const { scenarios, scenarioInfo, activeScenario, activeProfile, runSimulation, setTab } = useLabStore();

  const [scenario, setScenario] = useState(activeScenario);
  const [profile, setProfile] = useState(activeProfile);
  const [seed, setSeed] = useState(42);
  const [jobCount, setJobCount] = useState(50);
  const [generating, setGenerating] = useState(false);
  const [running, setRunning] = useState(false);
  const [workload, setWorkload] = useState<GeneratedWorkload | null>(null);

  const info = scenarioInfo[scenario];

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      setWorkload(await api.generateWorkload(scenario, seed, jobCount));
    } catch (e) {
      toast.error('Could not generate the workload', e);
    } finally {
      setGenerating(false);
    }
  };

  const handleSimulate = async () => {
    setRunning(true);
    const ok = await runSimulation(profile, scenario);
    setRunning(false);
    if (ok) setTab('overview');
  };

  const handleExport = () => {
    if (!workload) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(workload, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `workload_${scenario}_seed${seed}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const roleMix = workload
    ? Object.entries(
        workload.jobs.reduce<Record<string, number>>((acc, j) => ((acc[j.role] = (acc[j.role] || 0) + 1), acc), {}),
      ).sort((a, b) => b[1] - a[1])
    : [];

  return (
    <div>
      <PageHeader
        kicker="Workload generator"
        title={
          <>
            Scenario lab<span>.</span>
          </>
        }
        description="Generate a seeded synthetic workload (arrivals, role mix, job sizes, pooled-resource phases, node outages), inspect it, and run it under any profile. The same seed always produces the same trace."
      />

      <div className="stack">
        <section className="panel" aria-labelledby="sc-setup">
          <SectionHeading id="sc-setup" kicker="Setup" title="Scenario and policy" />
          <div className="panel-body stack" style={{ gap: 16 }}>
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              <Field label="Scenario">
                {(id) => (
                  <select id={id} className="control" value={scenario} onChange={(e) => setScenario(e.target.value)}>
                    {scenarios.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Seed">
                {(id) => <input id={id} type="number" className="control mono" value={seed} onChange={(e) => setSeed(parseInt(e.target.value, 10) || 0)} />}
              </Field>
              <Field label="Jobs" hint="10 – 1000">
                {(id, d) => (
                  <input
                    id={id}
                    aria-describedby={d}
                    type="number"
                    min={10}
                    max={1000}
                    className="control mono"
                    value={jobCount}
                    onChange={(e) => setJobCount(Math.min(1000, Math.max(10, parseInt(e.target.value, 10) || 50)))}
                  />
                )}
              </Field>
              <Field label="Run with profile">
                {(id) => <ProfilePicker id={id} value={profile} onChange={setProfile} />}
              </Field>
            </div>
            {info && (
              <div className="notice info">
                <FlaskConical />
                <span>
                  <b>{scenario}</b>: {info.description}
                </span>
              </div>
            )}
            <div className="page-actions">
              <button className="ghost-button" style={{ padding: '9px 14px' }} onClick={handleGenerate} disabled={generating}>
                <BusyIcon busy={generating} icon={<Search />} /> Inspect trace
              </button>
              <button className="primary-button" onClick={handleSimulate} disabled={running}>
                <BusyIcon busy={running} icon={<Play />} /> Simulate on Overview
              </button>
            </div>
            <p className="help">Overview runs use 50 jobs with the app seed; the trace inspector uses the values above.</p>
          </div>
        </section>

        <section className="panel" aria-labelledby="sc-trace" aria-busy={generating}>
          <SectionHeading
            id="sc-trace"
            kicker="Generated trace"
            title={workload ? `${workload.jobs.length} jobs` : 'Trace preview'}
            actions={
              workload ? (
                <button className="ghost-button" style={{ padding: '7px 12px' }} onClick={handleExport}>
                  <Download /> Export JSON
                </button>
              ) : undefined
            }
          />
          <div className="panel-body stack" style={{ gap: 16 }}>
            {!workload ? (
              generating ? (
                <div className="skeleton" style={{ height: 220 }} />
              ) : (
                <EmptyState icon={<Search />}>Generate a trace to see its jobs, role mix and node outages.</EmptyState>
              )
            ) : (
              <>
                <div className="flex flex-wrap gap-2" aria-label="Role mix">
                  {roleMix.map(([r, n]) => (
                    <span key={r} className="chip neutral">
                      {ROLE_LABEL[r] ?? r}: {n}
                    </span>
                  ))}
                  <span className="chip neutral">
                    Node outages: {workload.node_events.filter((e) => e.type === 'NODE_DOWN').length}
                  </span>
                </div>
                <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
                  <table className="data-table">
                    <caption className="sr-only">First {PREVIEW_ROWS} jobs of the generated trace</caption>
                    <thead>
                      <tr>
                        <th scope="col">Job</th>
                        <th scope="col">User</th>
                        <th scope="col">Role</th>
                        <th scope="col">Kind</th>
                        <th scope="col" className="num">Arrival</th>
                        <th scope="col" className="num">Burst</th>
                        <th scope="col" className="num">vCPU</th>
                        <th scope="col" className="num">Memory</th>
                        <th scope="col">Pooled max claim</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workload.jobs.slice(0, PREVIEW_ROWS).map((j) => (
                        <tr key={j.id}>
                          <td className="mono">{j.id}</td>
                          <td className="mono">{j.user_id}</td>
                          <td>{ROLE_LABEL[j.role] ?? j.role}</td>
                          <td>{j.kind}</td>
                          <td className="num">T+{j.arrival}m</td>
                          <td className="num">{j.burst} min</td>
                          <td className="num">{j.cpu}</td>
                          <td className="num">{j.mem} GB</td>
                          <td className="mono">{claim(j.max_claim)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {workload.jobs.length > PREVIEW_ROWS && (
                  <p className="help">
                    Showing the first {PREVIEW_ROWS} of {workload.jobs.length} jobs. Export JSON for the full trace.
                  </p>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
