import React, { useState } from 'react';
import { useLabStore } from '../store/useLabStore';
import { api } from '../services/api';
import { Database, Play, Download, Sparkles, Flame, Users } from 'lucide-react';

export const ScenarioLabPage: React.FC = () => {
  const { scenarios, activeScenario, activeProfile, runSimulation, setTab } = useLabStore();

  const [selectedScenario, setSelectedScenario] = useState(activeScenario);
  const [seed, setSeed] = useState(42);
  const [jobCount, setJobCount] = useState(50);
  const [loading, setLoading] = useState(false);
  const [workloadData, setWorkloadData] = useState<any>(null);

  const scenarioDescriptions: Record<string, string> = {
    exam_rush: 'Massive burst of short undergraduate assignments with strict deadline pressure and high queue contention.',
    hackathon_night: 'Uncoordinated arrivals of compute-intensive training jobs with cross-resource demands and high bursts.',
    research_mixed: 'Long-running multi-phase research simulations submitted by PhD students alongside undergraduate practical runs.',
    thesis_week: 'Critical PhD deadlines requesting GPU pools and large memory footprints, requiring soft node reservations.',
    node_failure_day: 'Mid-day hardware outages triggering process evictions, safe migrations, and trigger-based policy failovers.',
    balanced_day: 'Evenly distributed Poisson arrivals across all roles and job kinds throughout a standard 24-hour university cycle.',
  };

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const data = await api.generateWorkload(selectedScenario, seed, jobCount);
      setWorkloadData(data);
    } catch (e) {
      // Handled
    } finally {
      setLoading(false);
    }
  };

  const handleSimulate = async () => {
    await runSimulation(activeProfile, selectedScenario);
    setTab('overview');
  };

  const handleExportJSON = () => {
    if (!workloadData) return;
    const blob = new Blob([JSON.stringify(workloadData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workload_${selectedScenario}_seed${seed}.json`;
    a.click();
  };

  return (
    <div className="flex-1 p-6 max-w-[1400px] w-full mx-auto space-y-6 overflow-y-auto font-mono text-xs">
      {/* Header */}
      <div className="pb-4 border-b border-cr-border">
        <h1 className="text-xl font-bold uppercase tracking-wider text-white flex items-center gap-2">
          <Database className="w-5 h-5 text-cr-cyan" />
          Workload Scenario Synthesis Lab
        </h1>
        <p className="text-xs text-slate-400 mt-1 font-sans">
          Poisson-burst realistic synthetic trace generators with role mixes, phase resource demands,
          and hardware failure schedules (spec §5).
        </p>
      </div>

      {/* Generator Controls */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-cr-surface p-4 rounded-xl border border-cr-border">
        <div>
          <label className="text-slate-400 block mb-1">Scenario Type</label>
          <select
            value={selectedScenario}
            onChange={(e) => setSelectedScenario(e.target.value)}
            className="w-full bg-cr-card border border-cr-border rounded-lg px-3 py-1.5 text-white capitalize focus:outline-none"
          >
            {scenarios.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-slate-400 block mb-1">PRNG Deterministic Seed</label>
          <input
            type="number"
            value={seed}
            onChange={(e) => setSeed(parseInt(e.target.value) || 0)}
            className="w-full bg-cr-card border border-cr-border rounded-lg px-3 py-1.5 text-white focus:outline-none"
          />
        </div>

        <div>
          <label className="text-slate-400 block mb-1">Job Count (N)</label>
          <input
            type="number"
            min={10}
            max={1000}
            value={jobCount}
            onChange={(e) => setJobCount(parseInt(e.target.value) || 50)}
            className="w-full bg-cr-card border border-cr-border rounded-lg px-3 py-1.5 text-white focus:outline-none"
          />
        </div>

        <div className="flex items-end gap-2">
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="flex-1 py-2 bg-cr-card hover:bg-cr-cardHover text-slate-200 border border-cr-border rounded-lg font-bold transition"
          >
            {loading ? 'Synthesizing...' : 'Inspect Trace'}
          </button>
          <button
            onClick={handleSimulate}
            className="flex-1 py-2 bg-cr-cyan/20 hover:bg-cr-cyan/30 text-cr-cyan border border-cr-cyan/50 rounded-lg font-bold transition cr-glow-cyan"
          >
            Simulate Now
          </button>
        </div>
      </div>

      {/* Scenario Overview Description Card */}
      <div className="p-4 rounded-xl bg-cr-card border border-cr-border flex items-start gap-3">
        <Sparkles className="w-5 h-5 text-cr-cyan shrink-0 mt-0.5" />
        <div>
          <h2 className="text-sm font-bold text-white uppercase mb-1">
            {selectedScenario.replace('_', ' ')} Workload Characteristics
          </h2>
          <p className="text-slate-300 font-sans text-xs leading-relaxed">
            {scenarioDescriptions[selectedScenario] || 'Realistic campus compute workload.'}
          </p>
        </div>
      </div>

      {/* Generated Trace Preview Table & Export */}
      {workloadData && (
        <div className="bg-cr-surface border border-cr-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-cr-border pb-2.5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">
              Synthesized Jobs Sample ({workloadData.jobs?.length || 0} Jobs Generated)
            </h2>
            <button
              onClick={handleExportJSON}
              className="flex items-center gap-1.5 px-3 py-1 bg-cr-card hover:bg-slate-700 text-slate-200 border border-cr-border rounded-lg text-xs transition"
            >
              <Download className="w-3.5 h-3.5" /> <span>Export JSON</span>
            </button>
          </div>

          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-cr-border text-slate-400 text-[10px] uppercase">
                  <th className="py-2 px-2">Job ID</th>
                  <th className="py-2 px-2">User</th>
                  <th className="py-2 px-2">Role</th>
                  <th className="py-2 px-2">Kind</th>
                  <th className="py-2 px-2">Arrival</th>
                  <th className="py-2 px-2">Burst</th>
                  <th className="py-2 px-2">Cores</th>
                  <th className="py-2 px-2">RAM</th>
                  <th className="py-2 px-2">Max Pooled Claim</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cr-border/40">
                {workloadData.jobs?.slice(0, 25).map((j: any) => (
                  <tr key={j.id} className="hover:bg-cr-card/40 transition">
                    <td className="py-2 px-2 font-bold text-white">{j.id}</td>
                    <td className="py-2 px-2 text-slate-400">{j.user_id}</td>
                    <td className="py-2 px-2 text-cr-cyan uppercase font-bold">{j.role}</td>
                    <td className="py-2 px-2 text-slate-300">{j.kind}</td>
                    <td className="py-2 px-2 text-slate-300">t={j.arrival}m</td>
                    <td className="py-2 px-2 text-white">{j.burst}m</td>
                    <td className="py-2 px-2">{j.cpu}c</td>
                    <td className="py-2 px-2">{j.mem}G</td>
                    <td className="py-2 px-2 text-cr-emerald">
                      {j.max_claim?.gpu > 0 && `${j.max_claim.gpu}G `}
                      {j.max_claim?.lic > 0 && `${j.max_claim.lic}L `}
                      {j.max_claim?.io > 0 && `${j.max_claim.io}IO`}
                      {(!j.max_claim || (j.max_claim.gpu === 0 && j.max_claim.lic === 0 && j.max_claim.io === 0)) && '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
