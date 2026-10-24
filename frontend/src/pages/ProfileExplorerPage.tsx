import React, { useMemo, useState } from 'react';
import { useLabStore } from '../store/useLabStore';
import { Check, GitCompareArrows, Layers3, Play } from 'lucide-react';
import { Profile } from '../types';
import { EmptyState, Field, PageHeader, SkeletonCards } from '../components/ui';
import { groupProfiles, profileLabel } from '../lib/format';
import { toast } from '../store/useFeedback';

const PAGE = 24;

const ProfileCard: React.FC<{ p: Profile; active: boolean; onRun: () => void; onCompare: () => void; comparing: boolean }> = ({
  p,
  active,
  onRun,
  onCompare,
  comparing,
}) => (
  <article className={`panel profile-card ${active ? 'active' : ''}`} aria-label={p.name}>
    <div className="flex items-start justify-between gap-3">
      <h3>{profileLabel(p.name)}</h3>
      <span className="chip neutral mono">{p.scheduler}</span>
    </div>
    <div className="kv">
      <span>
        Family <b>{p.family}</b>
      </span>
      <span>
        Placement <b>{p.placement}-fit</b>
      </span>
      <span>
        Banker <b>{p.banker}</b>
      </span>
      <span>
        Backfill <b>{p.backfill ? 'on' : 'off'}</b>
      </span>
      {p.quantum ? (
        <span>
          Quantum <b className="mono">{p.quantum} min</b>
        </span>
      ) : null}
      {p.aging_rate > 0 && (
        <span>
          Aging <b className="mono">+{p.aging_rate}/min</b>
        </span>
      )}
      {p.preemptive && (
        <span>
          Preemptive <b>{p.preempt_by?.length ? `by ${p.preempt_by.join(', ')}` : 'yes'}</b>
        </span>
      )}
      {p.quota_per_user ? (
        <span>
          Quota <b className="mono">{p.quota_per_user}/user</b>
        </span>
      ) : null}
      {p.reserved_role && (
        <span>
          Reserved <b>{p.reserved_role} ({Math.round(p.reserved_pct * 100)}%)</b>
        </span>
      )}
    </div>
    <div className="card-actions">
      <button className={active ? 'ghost-button' : 'primary-button'} onClick={onRun} style={{ padding: '8px 10px' }}>
        {active ? <Check /> : <Play />} {active ? 'Active' : 'Run on Overview'}
      </button>
      <button className="ghost-button" onClick={onCompare} aria-pressed={comparing} style={{ padding: '8px 10px' }}>
        <GitCompareArrows /> {comparing ? 'In comparison' : 'Compare'}
      </button>
    </div>
  </article>
);

export const ProfileExplorerPage: React.FC = () => {
  const { profiles, activeProfile, runSimulation, setTab, addCompareProfile, compareProfileNames } = useLabStore();
  const [search, setSearch] = useState('');
  const [family, setFamily] = useState('all');
  const [scheduler, setScheduler] = useState('all');
  const [banker, setBanker] = useState('all');
  const [showVariants, setShowVariants] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  const families = useMemo(() => ['all', ...Array.from(new Set(profiles.map((p) => p.family))).sort()], [profiles]);
  const groups = groupProfiles(profiles);

  const matches = (p: Profile) =>
    (!search || p.name.toLowerCase().includes(search.toLowerCase()) || profileLabel(p.name).toLowerCase().includes(search.toLowerCase())) &&
    (family === 'all' || p.family === family) &&
    (scheduler === 'all' || p.scheduler === scheduler) &&
    (banker === 'all' || p.banker === banker);

  const base = [...groups.base, ...groups.custom].filter(matches);
  const variants = groups.variants.filter(matches);
  const shownVariants = variants.slice(0, limit);

  const run = async (name: string) => {
    if (await runSimulation(name)) setTab('overview');
  };
  const compare = (name: string) => {
    if (addCompareProfile(name)) toast.success(`Added ${name} to the comparison`);
  };

  const card = (p: Profile) => (
    <ProfileCard
      key={p.name}
      p={p}
      active={p.name === activeProfile}
      onRun={() => run(p.name)}
      onCompare={() => compare(p.name)}
      comparing={compareProfileNames.includes(p.name)}
    />
  );

  return (
    <div>
      <PageHeader
        kicker="Policy catalog"
        title={
          <>
            Scheduling profiles<span>.</span>
          </>
        }
        description={`${profiles.length} profiles: ${groups.base.length} hand-written base policies${
          groups.custom.length ? `, ${groups.custom.length} custom` : ''
        }, and ${groups.variants.length} generated variants that sweep placement, Banker mode and the quantum or aging knob.`}
        actions={
          <button className="ghost-button" style={{ padding: '9px 14px' }} onClick={() => setTab('builder')}>
            New custom profile
          </button>
        }
      />

      <section className="panel" aria-label="Filters" style={{ padding: 18, marginBottom: 20 }}>
        <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
          <Field label="Search">
            {(id) => (
              <input
                id={id}
                type="search"
                className="control"
                value={search}
                placeholder="e.g. exam, best-fit, q=2"
                onChange={(e) => {
                  setSearch(e.target.value);
                  setLimit(PAGE);
                }}
              />
            )}
          </Field>
          <Field label="Family">
            {(id) => (
              <select id={id} className="control" value={family} onChange={(e) => setFamily(e.target.value)}>
                {families.map((f) => (
                  <option key={f} value={f}>
                    {f === 'all' ? 'All families' : f}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Scheduler">
            {(id) => (
              <select id={id} className="control" value={scheduler} onChange={(e) => setScheduler(e.target.value)}>
                {['all', 'FCFS', 'SJF', 'RR', 'PRIORITY'].map((s) => (
                  <option key={s} value={s}>
                    {s === 'all' ? 'All schedulers' : s}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Banker mode">
            {(id) => (
              <select id={id} className="control" value={banker} onChange={(e) => setBanker(e.target.value)}>
                {['all', 'off', 'lenient', 'strict'].map((b) => (
                  <option key={b} value={b}>
                    {b === 'all' ? 'Any Banker mode' : b}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
      </section>

      {profiles.length === 0 ? (
        <SkeletonCards />
      ) : (
        <div className="stack" style={{ gap: 28 }}>
          <section aria-labelledby="base-heading">
            <h2 id="base-heading" className="section-kicker" style={{ margin: '0 0 12px' }}>
              Base and custom profiles · {base.length}
            </h2>
            {base.length ? (
              <div className="card-grid">{base.map(card)}</div>
            ) : (
              <EmptyState icon={<Layers3 />}>No base or custom profiles match these filters.</EmptyState>
            )}
          </section>

          <section aria-labelledby="variant-heading">
            <div className="flex flex-wrap items-center justify-between gap-3" style={{ marginBottom: 12 }}>
              <h2 id="variant-heading" className="section-kicker" style={{ margin: 0 }}>
                Generated variants · {variants.length} match
              </h2>
              <button className="ghost-button" style={{ padding: '7px 12px' }} aria-expanded={showVariants} onClick={() => setShowVariants((v) => !v)}>
                {showVariants ? 'Hide variants' : 'Show variants'}
              </button>
            </div>
            {showVariants &&
              (variants.length ? (
                <>
                  <div className="card-grid">{shownVariants.map(card)}</div>
                  <div className="flex flex-col items-center gap-2" style={{ marginTop: 18 }}>
                    <span className="help">
                      Showing {shownVariants.length} of {variants.length} variants
                    </span>
                    {shownVariants.length < variants.length && (
                      <button className="ghost-button" style={{ padding: '8px 16px' }} onClick={() => setLimit((l) => l + PAGE)}>
                        Load more
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <EmptyState icon={<Layers3 />}>No variants match these filters.</EmptyState>
              ))}
          </section>
        </div>
      )}
    </div>
  );
};
