import React, { useState } from 'react';
import { useLabStore } from '../store/useLabStore';
import { api } from '../services/api';
import {
  Terminal,
  Play,
  Flame,
  Radio,
  PowerOff,
  RotateCcw,
  Save,
  CheckCircle2,
  Trash2,
  Cpu,
  Layers,
} from 'lucide-react';

export const LiveConsolePage: React.FC = () => {
  const { liveState, profiles, liveConnected } = useLabStore();

  // Student submission form state
  const [userId, setUserId] = useState('student_alice');
  const [role, setRole] = useState('ug');
  const [scriptName, setScriptName] = useState('cpu_burn.py');
  const [duration, setDuration] = useState(4.0);
  const [cpu, setCpu] = useState(1);
  const [mem, setMem] = useState(2);
  const [gpu, setGpu] = useState(0);

  // Admin controls state
  const [targetProfile, setTargetProfile] = useState('practical_session');
  const [rushCount, setRushCount] = useState(5);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const showMsg = (msg: string) => {
    setActionMsg(msg);
    setTimeout(() => setActionMsg(null), 3500);
  };

  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.submitLiveJob({
        user_id: userId,
        role,
        kind: 'training',
        cpu,
        mem,
        duration,
        script_name: scriptName,
        gpu,
      });
      showMsg(`Job ${res.job_id} submitted to live dispatch queue!`);
    } catch (err: any) {
      showMsg(`Submission error: ${err.message}`);
    }
  };

  const handleInjectRush = async () => {
    try {
      const res = await api.injectLiveRush({
        count: rushCount,
        role: 'ug',
        script_name: 'matrix_mult.py',
        duration: 5.0,
      });
      showMsg(`Injected rush of ${res.job_ids.length} jobs concurrently!`);
    } catch (err: any) {
      showMsg(`Rush error: ${err.message}`);
    }
  };

  const handleSwitchProfile = async () => {
    try {
      await api.switchLiveProfile(targetProfile);
      showMsg(`Live scheduler policy hot-switched to '${targetProfile}'!`);
    } catch (err: any) {
      showMsg(`Switch error: ${err.message}`);
    }
  };

  const handleRestartSession = async () => {
    try {
      await api.restartLiveSession();
      showMsg('Live lab session reset with clean state!');
    } catch (err: any) {
      showMsg(`Reset error: ${err.message}`);
    }
  };

  const handleSaveSession = async () => {
    try {
      const res = await api.saveLiveSession();
      showMsg(`Session saved as Run '${res.run_id}' for replay!`);
    } catch (err: any) {
      showMsg(`Save error: ${err.message}`);
    }
  };

  const handleKillJob = async (jid: string) => {
    try {
      await api.killLiveJob(jid);
      showMsg(`Terminated job ${jid}`);
    } catch (err: any) {
      showMsg(`Kill error: ${err.message}`);
    }
  };

  const runningJobs = liveState?.running_jobs || [];

  return (
    <div className="flex-1 p-6 max-w-[1400px] w-full mx-auto space-y-6 overflow-y-auto font-mono text-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-cr-border">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-wider text-white flex items-center gap-2">
            <Terminal className="w-5 h-5 text-cr-emerald" />
            Live Process Lab Console (Stage 9 OS Subprocesses)
          </h1>
          <p className="text-xs text-slate-400 mt-1 font-sans">
            Spawns real OS Python child processes, applies dynamic preemption (via POSIX SIGSTOP/SIGCONT),
            and performs live Banker's avoidance on pooled resources.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSaveSession}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-cr-cyan/20 text-cr-cyan border border-cr-cyan/40 rounded-lg hover:bg-cr-cyan/30 transition"
          >
            <Save className="w-3.5 h-3.5" /> <span>Save as Sim Run</span>
          </button>
          <button
            onClick={handleRestartSession}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-cr-rose/20 text-cr-rose border border-cr-rose/40 rounded-lg hover:bg-cr-rose/30 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" /> <span>Reset Session</span>
          </button>
        </div>
      </div>

      {actionMsg && (
        <div className="p-3 bg-cr-cyan/20 border border-cr-cyan/40 text-cr-cyan font-bold rounded-xl cr-glow-cyan">
          {actionMsg}
        </div>
      )}

      {/* Two-Column Grid: Student Submissions vs Admin Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Student Job Submission Terminal */}
        <div className="bg-cr-surface border border-cr-border rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2 pb-2.5 border-b border-cr-border">
            <Play className="w-4 h-4 text-cr-cyan" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">
              Student Process Dispatcher
            </h2>
          </div>

          <form onSubmit={handleStudentSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-slate-400 block mb-1">User Identifier</label>
                <input
                  type="text"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  className="w-full bg-cr-card border border-cr-border rounded-lg px-2.5 py-1.5 text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">User Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full bg-cr-card border border-cr-border rounded-lg px-2.5 py-1.5 text-slate-200 uppercase focus:outline-none"
                >
                  <option value="ug">UG Student</option>
                  <option value="phd">PhD Researcher</option>
                  <option value="faculty">Faculty Member</option>
                  <option value="exam">Exam Student</option>
                  <option value="demo">Viva Demo</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Real Python Benchmark Script</label>
              <select
                value={scriptName}
                onChange={(e) => setScriptName(e.target.value)}
                className="w-full bg-cr-card border border-cr-border rounded-lg px-2.5 py-1.5 text-white focus:outline-none font-bold"
              >
                <option value="cpu_burn.py">cpu_burn.py (Pure CPU Math Burner)</option>
                <option value="matrix_mult.py">matrix_mult.py (Heavy Matrix Operations)</option>
                <option value="prime_sieve.py">prime_sieve.py (Sieve of Eratosthenes)</option>
                <option value="hash_files.py">hash_files.py (SHA-256 I/O & CPU Hashing)</option>
                <option value="monte_carlo_pi.py">monte_carlo_pi.py (Monte Carlo Pi Estimation)</option>
                <option value="sleep_io.py">sleep_io.py (Simulated I/O Blocking Work)</option>
              </select>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-slate-400 block mb-1">Duration (s)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="60"
                  value={duration}
                  onChange={(e) => setDuration(parseFloat(e.target.value) || 4.0)}
                  className="w-full bg-cr-card border border-cr-border rounded-lg px-2.5 py-1 text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Cores</label>
                <input
                  type="number"
                  min="1"
                  max="8"
                  value={cpu}
                  onChange={(e) => setCpu(parseInt(e.target.value) || 1)}
                  className="w-full bg-cr-card border border-cr-border rounded-lg px-2.5 py-1 text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">GPU Claim</label>
                <input
                  type="number"
                  min="0"
                  max="2"
                  value={gpu}
                  onChange={(e) => setGpu(parseInt(e.target.value) || 0)}
                  className="w-full bg-cr-card border border-cr-border rounded-lg px-2.5 py-1 text-white focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-cr-cyan/20 hover:bg-cr-cyan/30 text-cr-cyan border border-cr-cyan/50 rounded-xl font-bold uppercase transition cr-glow-cyan"
            >
              Submit Live Job
            </button>
          </form>
        </div>

        {/* Admin Control Room & Chaos Injector */}
        <div className="bg-cr-surface border border-cr-border rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2 pb-2.5 border-b border-cr-border">
            <Flame className="w-4 h-4 text-cr-amber" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">
              Admin Control Room & Chaos Engine
            </h2>
          </div>

          {/* Hot Policy Switcher */}
          <div className="p-3 bg-cr-card border border-cr-border rounded-lg space-y-2">
            <label className="text-slate-300 font-bold block">
              1. Hot-Switch Active Scheduling Policy
            </label>
            <div className="flex gap-2">
              <select
                value={targetProfile}
                onChange={(e) => setTargetProfile(e.target.value)}
                className="flex-1 bg-cr-surface border border-cr-border rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none"
              >
                {profiles.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} ({p.scheduler} • Banker {p.banker})
                  </option>
                ))}
              </select>
              <button
                onClick={handleSwitchProfile}
                className="px-3 py-1.5 bg-cr-amber/20 hover:bg-cr-amber/30 text-cr-amber border border-cr-amber/50 rounded-lg font-bold transition"
              >
                Apply Live
              </button>
            </div>
          </div>

          {/* Rush Injector */}
          <div className="p-3 bg-cr-card border border-cr-border rounded-lg space-y-2">
            <label className="text-slate-300 font-bold block">
              2. Inject Sudden Deadline / Exam Rush
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="1"
                max="15"
                value={rushCount}
                onChange={(e) => setRushCount(parseInt(e.target.value) || 5)}
                className="w-20 bg-cr-surface border border-cr-border rounded-lg px-2 py-1 text-white focus:outline-none"
              />
              <span className="text-slate-400">concurrent undergraduate processes</span>
              <button
                onClick={handleInjectRush}
                className="ml-auto px-3 py-1.5 bg-cr-rose/20 hover:bg-cr-rose/30 text-cr-rose border border-cr-rose/50 rounded-lg font-bold transition"
              >
                Inject Burst
              </button>
            </div>
          </div>

          {/* Information Notice */}
          <div className="p-2.5 bg-cr-surface border border-cr-border rounded-lg text-slate-400 text-[11px] font-sans">
            <b>Preemption Behavior:</b> Switching to Round-Robin or Priority allows the scheduler to
            suspend running worker processes via <code className="text-cr-cyan">psutil.Process.suspend()</code> and
            resume them when quantum or priority permits.
          </div>
        </div>
      </div>

      {/* Active Running OS Child Processes Table */}
      <div className="bg-cr-surface border border-cr-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-cr-border pb-2.5">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cr-cyan" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">
              Active OS Child Processes ({runningJobs.length} Running)
            </h2>
          </div>
          <span className="text-[11px] text-slate-400">
            Monitored in real-time via <code className="text-cr-cyan">psutil</code>
          </span>
        </div>

        {runningJobs.length === 0 ? (
          <div className="text-center py-6 text-slate-500 italic">
            No processes currently dispatched on nodes. Submit jobs or inject a rush above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-cr-border text-slate-400 text-[10px] uppercase">
                  <th className="py-2 px-2">Job ID</th>
                  <th className="py-2 px-2">Node Assigned</th>
                  <th className="py-2 px-2">Role</th>
                  <th className="py-2 px-2">Kind</th>
                  <th className="py-2 px-2">CPU Utilization</th>
                  <th className="py-2 px-2">RAM Footprint</th>
                  <th className="py-2 px-2">Status</th>
                  <th className="py-2 px-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cr-border/40">
                {runningJobs.map((j) => (
                  <tr key={j.id} className="hover:bg-cr-card/40 transition">
                    <td className="py-2.5 px-2 font-bold text-white">{j.id}</td>
                    <td className="py-2.5 px-2 text-cr-cyan">Node {j.node_id}</td>
                    <td className="py-2.5 px-2 uppercase font-bold text-slate-300">{j.role}</td>
                    <td className="py-2.5 px-2 text-slate-400">{j.kind}</td>
                    <td className="py-2.5 px-2 text-cr-emerald font-bold">
                      {j.metrics?.cpu_percent ?? 0.0}%
                    </td>
                    <td className="py-2.5 px-2 text-blue-300">
                      {j.metrics?.memory_rss_mb ?? 0.0} MB
                    </td>
                    <td className="py-2.5 px-2">
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-cr-emerald/20 text-cr-emerald border border-cr-emerald/40 uppercase font-bold">
                        {j.metrics?.status || 'RUNNING'}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-right">
                      <button
                        onClick={() => handleKillJob(j.id)}
                        className="p-1 rounded bg-cr-rose/20 hover:bg-cr-rose/30 text-cr-rose border border-cr-rose/40 transition"
                        title="Kill Job"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
