import { create } from 'zustand';
import { api, ScenarioInfo } from '../services/api';
import {
  ClusterModel,
  LiveStateSnapshot,
  Profile,
  RunResult,
} from '../types';
import { ReplayEngine, ReplayState } from '../engine/replayEngine';

export type TabKey =
  | 'overview'
  | 'compare'
  | 'profiles'
  | 'builder'
  | 'calendar'
  | 'scenarios'
  | 'live'
  | 'analytics';

interface LabState {
  currentTab: TabKey;
  mode: 'simulation' | 'live';
  loading: boolean;
  error: string | null;

  // Cluster & Profiles
  cluster: ClusterModel | null;
  profiles: Profile[];
  scenarios: string[];
  scenarioInfo: Record<string, ScenarioInfo>;

  // Simulation State
  activeScenario: string;
  activeProfile: string;
  seed: number;
  runResult: RunResult | null;
  replayEngine: ReplayEngine | null;
  scrubberTime: number;
  maxScrubberTime: number;
  isPlaying: boolean;
  playbackSpeed: number;
  replayState: ReplayState | null;

  // Live Mode State
  liveState: LiveStateSnapshot | null;
  liveConnected: boolean;

  // Drawer & Inspection
  selectedJobId: string | null;

  // Compare Tab State
  compareProfileNames: string[];
  compareRuns: Record<string, RunResult>;

  // Actions
  setTab: (tab: TabKey) => void;
  setMode: (mode: 'simulation' | 'live') => void;
  setSelectedJobId: (jid: string | null) => void;
  setPlaybackSpeed: (speed: number) => void;
  setScrubberTime: (t: number) => void;
  togglePlay: () => void;
  initApp: () => Promise<void>;
  refreshProfiles: () => Promise<Profile[]>;
  /** Resolves true on success; failures are reported via `error`. */
  runSimulation: (profileName?: string, scenarioName?: string) => Promise<boolean>;
  /** Run the active scenario under the saved calendar schedule. */
  runScheduledSimulation: (scenarioName?: string) => Promise<boolean>;
  stepForward: (delta?: number) => void;
  stepBackward: (delta?: number) => void;
  jumpToNextDeadlock: () => void;

  // Compare actions
  toggleCompareProfile: (name: string) => void;
  runCompareBatch: () => Promise<void>;

  // Live WebSocket
  initLiveWebSocket: () => void;
}

export const useLabStore = create<LabState>((set, get) => {
  let playInterval: any = null;
  let ws: WebSocket | null = null;
  let reconnectTimer: any = null;
  let reconnectAttempts = 0;

  /** Fetch a run, build its replay, and make it the active run. */
  const loadRun = async (fetchRun: () => Promise<RunResult>, profileName: string | null) => {
    set({ loading: true, error: null });
    try {
      const result = await fetchRun();
      const { cluster } = get();
      if (!cluster) return false;
      const startProfile = result.initial_profile || profileName || result.profile_name;
      const engine = new ReplayEngine(cluster, result.events || [], startProfile);
      const maxT = engine.getMaxTime();
      const initialT = Math.min(12, maxT);
      if (playInterval) {
        clearInterval(playInterval);
        playInterval = null;
      }
      set({
        runResult: result,
        replayEngine: engine,
        maxScrubberTime: maxT,
        scrubberTime: initialT,
        replayState: engine.getStateAt(initialT),
        isPlaying: false,
      });
      return true;
    } catch (err: any) {
      set({ error: err.message || 'Simulation run failed' });
      return false;
    } finally {
      set({ loading: false });
    }
  };

  return {
    currentTab: 'overview',
    mode: 'simulation',
    loading: false,
    error: null,

    cluster: null,
    profiles: [],
    scenarios: [],
    scenarioInfo: {},

    activeScenario: 'exam_rush',
    activeProfile: 'practical_session',
    seed: 42,
    runResult: null,
    replayEngine: null,
    scrubberTime: 0,
    maxScrubberTime: 100,
    isPlaying: false,
    playbackSpeed: 5,
    replayState: null,

    liveState: null,
    liveConnected: false,
    selectedJobId: null,

    compareProfileNames: ['practical_session', 'assignment_crunch'],
    compareRuns: {},

    setTab: (tab) => set({ currentTab: tab }),
    setMode: (mode) => set({ mode }),
    setSelectedJobId: (jid) => set({ selectedJobId: jid }),
    setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),

    setScrubberTime: (t) => {
      const { replayEngine, maxScrubberTime } = get();
      const clamped = Math.max(0, Math.min(t, maxScrubberTime));
      const state = replayEngine ? replayEngine.getStateAt(clamped) : null;
      set({ scrubberTime: clamped, replayState: state });
    },

    togglePlay: () => {
      const { isPlaying, scrubberTime, maxScrubberTime, playbackSpeed } = get();
      if (isPlaying) {
        clearInterval(playInterval);
        playInterval = null;
        set({ isPlaying: false });
      } else {
        if (scrubberTime >= maxScrubberTime) {
          get().setScrubberTime(0);
        }
        set({ isPlaying: true });
        playInterval = setInterval(() => {
          const s = get();
          const nextTime = s.scrubberTime + (s.playbackSpeed * 0.1);
          if (nextTime >= s.maxScrubberTime) {
            s.setScrubberTime(s.maxScrubberTime);
            clearInterval(playInterval);
            playInterval = null;
            set({ isPlaying: false });
          } else {
            s.setScrubberTime(nextTime);
          }
        }, 100);
      }
    },

    stepForward: (delta = 5) => {
      const { scrubberTime } = get();
      get().setScrubberTime(scrubberTime + delta);
    },

    stepBackward: (delta = 5) => {
      const { scrubberTime } = get();
      get().setScrubberTime(scrubberTime - delta);
    },

    jumpToNextDeadlock: () => {
      const { runResult, scrubberTime } = get();
      if (!runResult) return;
      const dl = runResult.events.find(
        (e) => (e.type === 'DEADLOCK_DETECTED' || e.type === 'BANKER_DENIED') && e.t > scrubberTime
      );
      if (dl) {
        get().setScrubberTime(dl.t);
      }
    },

    initApp: async () => {
      set({ loading: true, error: null });
      try {
        const [clusterData, profileList, scenarioData] = await Promise.all([
          api.getCluster(),
          api.getProfiles(),
          api.getScenarios(),
        ]);

        const scenarioList = scenarioData.map((s) => s.name);
        const info: Record<string, ScenarioInfo> = {};
        for (const s of scenarioData) info[s.name] = s;

        const { activeProfile, activeScenario } = get();
        const initProfile = profileList.some((p) => p.name === activeProfile)
          ? activeProfile
          : profileList[0]?.name || 'practical_session';
        const initScenario = scenarioList.includes(activeScenario)
          ? activeScenario
          : scenarioList[0] || 'exam_rush';

        set({
          cluster: clusterData,
          profiles: profileList,
          scenarios: scenarioList,
          scenarioInfo: info,
          activeScenario: initScenario,
          activeProfile: initProfile,
        });

        get().initLiveWebSocket();
        await get().runSimulation(initProfile, initScenario);
      } catch (err: any) {
        set({ error: err.message || 'Failed to initialize app' });
      } finally {
        set({ loading: false });
      }
    },

    refreshProfiles: async () => {
      const profileList = await api.getProfiles();
      set({ profiles: profileList });
      return profileList;
    },

    runSimulation: async (profileName?: string, scenarioName?: string) => {
      const pName = profileName || get().activeProfile;
      const sName = scenarioName || get().activeScenario;
      set({ activeProfile: pName, activeScenario: sName });
      return loadRun(
        () => api.runSimulation({ scenario: sName, profile_name: pName, seed: get().seed, n_jobs: 50 }),
        pName,
      );
    },

    runScheduledSimulation: async (scenarioName?: string) => {
      const sName = scenarioName || get().activeScenario;
      set({ activeScenario: sName });
      return loadRun(
        () => api.runSimulation({ scenario: sName, use_schedule: true, seed: get().seed, n_jobs: 50 }),
        null,
      );
    },

    toggleCompareProfile: (name: string) => {
      const { compareProfileNames } = get();
      if (compareProfileNames.includes(name)) {
        if (compareProfileNames.length > 1) {
          set({ compareProfileNames: compareProfileNames.filter((n) => n !== name) });
        }
      } else {
        if (compareProfileNames.length < 4) {
          set({ compareProfileNames: [...compareProfileNames, name] });
        }
      }
    },

    runCompareBatch: async () => {
      const { compareProfileNames, activeScenario, seed } = get();
      set({ loading: true, error: null });
      try {
        const runs: Record<string, RunResult> = {};
        for (const p of compareProfileNames) {
          const res = await api.runSimulation({
            scenario: activeScenario,
            profile_name: p,
            seed,
            n_jobs: 50,
          });
          runs[p] = res;
        }
        set({ compareRuns: runs });
      } catch (err: any) {
        set({ error: err.message || 'Batch comparison failed' });
      } finally {
        set({ loading: false });
      }
    },

    initLiveWebSocket: () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (ws) {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          return;
        }
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        ws.close();
        ws = null;
      }
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/live`;
      try {
        ws = new WebSocket(wsUrl);
        ws.onopen = () => {
          reconnectAttempts = 0;
          set({ liveConnected: true });
        };
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'INIT_STATE' || data.type === 'STATE_SNAPSHOT') {
              set({ liveState: data.data || data.details });
            }
          } catch (e) {
            // Ignore parse errors
          }
        };
        ws.onclose = () => {
          set({ liveConnected: false });
          ws = null;
          reconnectAttempts++;
          const delay = Math.min(10000, 3000 + (reconnectAttempts - 1) * 2000);
          reconnectTimer = setTimeout(() => {
            get().initLiveWebSocket();
          }, delay);
        };
        ws.onerror = () => {
          set({ liveConnected: false });
        };
      } catch (e) {
        // Fallback
      }
    },
  };
});
