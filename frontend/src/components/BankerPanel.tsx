import React from 'react';
import { useLabStore } from '../store/useLabStore';
import { ArrowRight, ShieldAlert, ShieldCheck } from 'lucide-react';
import { PooledResources } from '../types';
import { BankerRow } from '../lib/banker';
import { fmtT, unitOf } from '../lib/format';
import { EmptyState, SectionHeading } from './ui';

const vec = (r: PooledResources) => `(${r.gpu}, ${r.lic}, ${r.io})`;

/**
 * Banker's algorithm view: Available vector, Allocation / Need per job holding
 * pooled resources, the safe sequence, and recent unsafe-request denials.
 */
export const BankerPanel: React.FC = () => {
  const { replayState, liveState, liveEvents, mode, setSelectedJobId, runResult, profiles, activeProfile } = useLabStore();
  const live = mode === 'live';

  let available: PooledResources = { gpu: 0, lic: 0, io: 0 };
  let rows: BankerRow[] = [];
  let sequence: string[] | null = null;
  let denials: { t: number; job: string; request?: PooledResources }[] = [];
  let bankerMode: string | undefined;

  if (live && liveState) {
    available = liveState.pooled.available;
    // The live Banker registers every job; only those holding or claiming pooled resources matter here.
    rows = liveState.banker.jobs.filter(
      (r) => r.allocation.gpu + r.allocation.lic + r.allocation.io + r.need.gpu + r.need.lic + r.need.io > 0,
    );
    sequence = liveState.banker_safe_sequence ?? null;
    bankerMode = liveState.banker.mode;
    denials = liveEvents
      .filter((e) => e.type === 'BANKER_DENIED')
      .slice(-6)
      .reverse()
      .map((e) => ({ t: e.t, job: e.job_id as string, request: e.details?.request }));
  } else if (replayState) {
    available = replayState.pooled.available;
    rows = replayState.banker_rows;
    sequence = replayState.safe_sequence;
    bankerMode = profiles.find((p) => p.name === (replayState.active_profile_name || activeProfile))?.banker;
    denials = replayState.denials.slice(0, 6).map((e: any) => ({ t: e.t, job: e.job_id, request: e.request }));
  }

  const safe = sequence !== null;
  const unit = live ? 's' : unitOf(runResult);

  return (
    <section className={`panel ${safe ? '' : 'banker-unsafe'}`} aria-labelledby="banker-heading">
      <SectionHeading
        id="banker-heading"
        kicker={`Deadlock avoidance${bankerMode ? ` · Banker ${bankerMode}` : ''}`}
        title="Banker's algorithm"
        actions={
          safe ? (
            <span className="chip">
              <ShieldCheck /> Safe state
            </span>
          ) : (
            <span className="chip warn">
              <ShieldAlert /> Unsafe state
            </span>
          )
        }
      />
      <div className="panel-body grid-2" style={{ alignItems: 'start' }}>
        <div className="stack" style={{ gap: 16 }}>
          <div>
            <div className="field-label" style={{ marginBottom: 8 }}>
              Available vector (GPU, licenses, I/O)
            </div>
            <div className="vector">
              <div>
                <span>GPU</span>
                <b>{available.gpu}</b>
              </div>
              <div>
                <span>Licenses</span>
                <b>{available.lic}</b>
              </div>
              <div>
                <span>I/O slots</span>
                <b>{available.io}</b>
              </div>
            </div>
          </div>

          <div>
            <div className="field-label" style={{ marginBottom: 8 }}>
              Safe sequence
            </div>
            {rows.length === 0 ? (
              <p className="help">No job holds or claims pooled resources right now, so any order is safe.</p>
            ) : safe ? (
              <div className="safe-seq" aria-label={`Safe sequence: ${sequence!.join(', ')}`}>
                {sequence!.map((id, i) => (
                  <React.Fragment key={id}>
                    <button className="chip mono" onClick={() => setSelectedJobId(id)}>
                      {id}
                    </button>
                    {i < sequence!.length - 1 && <ArrowRight aria-hidden="true" />}
                  </React.Fragment>
                ))}
              </div>
            ) : (
              <div className="notice" role="status">
                <ShieldAlert />
                <span>
                  No safe sequence: with the current Available vector some job's Need can never be met, so the
                  system could deadlock. {live ? '' : 'Banker mode "off" lets the simulator reach states like this.'}
                </span>
              </div>
            )}
          </div>

          <div>
            <div className="field-label" style={{ marginBottom: 8 }}>
              Recent unsafe-request denials
            </div>
            {denials.length === 0 ? (
              <p className="help">None so far.</p>
            ) : (
              <ul className="stack" style={{ gap: 6, listStyle: 'none', padding: 0, margin: 0 }}>
                {denials.map((d, i) => (
                  <li key={i} className="flex items-center gap-2 text-[12px]">
                    <span className="chip warn">
                      <ShieldAlert /> denied
                    </span>
                    <span className="mono">{fmtT(d.t, unit)}</span>
                    <button className="mono underline" onClick={() => setSelectedJobId(d.job)}>
                      {d.job}
                    </button>
                    {d.request && <span className="mono" style={{ color: 'var(--faint)' }}>{vec(d.request)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div>
          <div className="field-label" style={{ marginBottom: 8 }}>
            Allocation and Need (Need = Max − Allocation)
          </div>
          {rows.length === 0 ? (
            <EmptyState>No jobs are holding pooled resources at this moment.</EmptyState>
          ) : (
            <div className="table-wrap" style={{ maxHeight: 300, overflowY: 'auto' }}>
              <table className="data-table">
                <caption className="sr-only">Pooled resource allocation and remaining need per job, as (GPU, licenses, I/O)</caption>
                <thead>
                  <tr>
                    <th scope="col">Job</th>
                    <th scope="col">State</th>
                    <th scope="col" className="num">Allocation</th>
                    <th scope="col" className="num">Need</th>
                    <th scope="col" className="num">Order</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const pos = sequence ? sequence.indexOf(r.id) : -1;
                    return (
                      <tr key={r.id}>
                        <td>
                          <button className="mono underline" onClick={() => setSelectedJobId(r.id)}>
                            {r.id}
                          </button>
                        </td>
                        <td>{r.state}</td>
                        <td className="num">{vec(r.allocation)}</td>
                        <td className="num">{vec(r.need)}</td>
                        <td className="num">{pos >= 0 ? pos + 1 : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
