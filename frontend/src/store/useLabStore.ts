import { create } from 'zustand';
import { api, ScenarioInfo } from '../services/api';
import {
  ClusterModel,
  LiveStateSnapshot,
  Profile,
  RunResult,
  SimEvent,
} from '../types';
import { ReplayEngine, ReplayState } from '../engine/replayEngine';
import { toast } from './useFeedback';

export const TAB_KEYS = ['overview', 'compare', 'profiles', 'builder', 'calendar', 'scenarios', 'live', 'analytics'] as const;

/** Tab encoded in the URL hash, e.g. "#/compare". */
export function tabFromHash(hash: string = window.location.hash): TabKey | null {
  const key = hash.replace(/^#\/?/, '');
  return (TAB_KEYS as readonly string[]).includes(key) ? (key as TabKey) : null;
}

/** Most recent live events kept for the event feed and live Gantt. */
export const LIVE_EVENT_BUFFER = 200;

export type LiveLink = 'connecting' | 'open' | 'reconnecting';

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
  showLanding: boolean;
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
  liveLink: LiveLink;
  /** Rolling buffer of the last LIVE_EVENT_BUFFER live events (snapshots excluded). */
  liveEvents: SimEvent[];

  // Drawer & Inspection
  selectedJobId: string | null;

  // Compare Tab State
  compareProfileNames: string[];
  compareRuns: Record<string, RunResult>;
  /** Scenario the current compareRuns were produced for. */
  compareScenario: string | null;
  compareLoading: boolean;

  // Actions
  /** Switch tab; pushes a history entry unless `fromHistory`. */
  setTab: (tab: TabKey, fromHistory?: boolean) => void;
  setMode: (mode: 'simulation' | 'live') => void;
  setSelectedJobId: (jid: string | null) => void;
  setPlaybackSpeed: (speed: number) => void;
  setScrubberTime: (t: number) => void;
  togglePlay: () => void;
  initApp: () => Promise<void>;
  refreshProfiles: () => Promise<Profile[]>;
  /** Change the workload scenario (re-runs the active profile so every view agrees). */
  setActiveScenario: (scenario: string) => Promise<boolean>;
  /** Resolves true on success; failures are reported via `error`. */
  runSimulation: (profileName?: string, scenarioName?: string) => Promise<boolean>;
  /** Run the active scenario under the saved calendar schedule. */
  runScheduledSimulation: (scenarioName?: string) => Promise<boolean>;
  /** Load a stored run (e.g. a saved live session) into the replay view. */
  openSavedRun: (runId: string | number) => Promise<boolean>;
  stepForward: (delta?: number) => void;
  stepBackward: (delta?: number) => void;
  jumpToNextDeadlock: () => void;

  // Compare actions
  toggleCompareProfile: (name: string) => void;
  /** Add a profile to the comparison (max 4); returns false if it couldn't. */
  addCompareProfile: (name: string) => boolean;
  runCompareBatch: () => Promise<void>;

  // Live WebSocket
  initLiveWebSocket: () => void;

  /** Navigate back to the landing page. */
  goToLanding: () => void;
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
      const engine = new ReplayEngine(cluster, result.events || [], startProfile, result.workload?.jobs || []);
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
      toast.error('Simulation run failed', err);
      return false;
    } finally {
      set({ loading: false });
    }
  };

  return {
    showLanding: sessionStorage.getItem('labqueue_entered') !== '1',
    currentTab: tabFromHash() ?? 'overview',
    mode: tabFromHash() === 'live' ? 'live' : 'simulation',
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
    liveLink: 'connecting',
    liveEvents: [],
    selectedJobId: null,

    compareProfileNames: ['practical_session', 'assignment_crunch'],
    compareRuns: {},
    compareScenario: null,
    compareLoading: false,

    setTab: (tab, fromHistory = false) => {
      // The Live Console only makes sense against live data.
      set(tab === 'live' ? { currentTab: tab, mode: 'live' } : { currentTab: tab });
      if (!fromHistory && tabFromHash() !== tab) window.location.hash = `/${tab}`;
      if (!fromHistory) window.scrollTo({ top: 0 });
    },
    setMode: (mode) => set({ mode }),
    setSelectedJobId: (jid) => set({ selectedJobId: jid }),
    setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),

    goToLanding: () => {
      sessionStorage.removeItem('labqueue_entered');
      set({ showLanding: true });
    },

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
        (e) => e.type === 'DEADLOCK_DETECTED' && e.t > scrubberTime
      );
      if (dl) {
        get().setScrubberTime(dl.t);
      } else {
        toast.info('No later deadlock in this run');
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

    setActiveScenario: (scenario) => get().runSimulation(undefined, scenario),

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

    openSavedRun: async (runId) => {
      const ok = await loadRun(() => api.getRun(String(runId)), null);
      if (ok) set({ mode: 'simulation', currentTab: 'overview' });
      return ok;
    },

    toggleCompareProfile: (name: string) => {
      const { compareProfileNames } = get();
      if (compareProfileNames.includes(name)) {
        if (compareProfileNames.length > 2) {
          set({ compareProfileNames: compareProfileNames.filter((n) => n !== name) });
        } else {
          toast.info('Keep at least two policies to compare');
        }
      } else {
        get().addCompareProfile(name);
      }
    },

    addCompareProfile: (name: string) => {
      const { compareProfileNames } = get();
      if (compareProfileNames.includes(name)) return true;
      if (compareProfileNames.length >= 4) {
        toast.info('You can compare up to four policies', ['Remove one before adding another.']);
        return false;
      }
      set({ compareProfileNames: [...compareProfileNames, name] });
      return true;
    },

    runCompareBatch: async () => {
      const { compareProfileNames, activeScenario, seed } = get();
      set({ compareLoading: true });
      try {
        const results = await Promise.all(
          compareProfileNames.map((p) =>
            api.runSimulation({ scenario: activeScenario, profile_name: p, seed, n_jobs: 50 }),
          ),
        );
        const runs: Record<string, RunResult> = {};
        compareProfileNames.forEach((p, i) => (runs[p] = results[i]));
        set({ compareRuns: runs, compareScenario: activeScenario });
      } catch (err: any) {
        toast.error('Comparison failed', err);
      } finally {
        set({ compareLoading: false });
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
          set({ liveConnected: true, liveLink: 'open' });
        };
        ws.onmessage = (event) => {
          let data: any;
          try {
            data = JSON.parse(event.data);
          } catch {
            return;
          }
          if (data.type === 'INIT_STATE') {
            // Sent on connect and after a session reset: start the feed afresh.
            set({ liveState: data.data, liveEvents: [] });
          } else if (data.type === 'STATE_SNAPSHOT') {
            set({ liveState: data.details });
          } else if (data.type) {
            const buf = get().liveEvents;
            set({ liveEvents: [...buf.slice(-(LIVE_EVENT_BUFFER - 1)), data as SimEvent] });
          }
        };
        ws.onclose = () => {
          set({ liveConnected: false, liveLink: 'reconnecting' });
          ws = null;
          reconnectAttempts++;
          const delay = Math.min(10000, 3000 + (reconnectAttempts - 1) * 2000);
          reconnectTimer = setTimeout(() => {
            get().initLiveWebSocket();
          }, delay);
        };
        ws.onerror = () => {
          set({ liveConnected: false, liveLink: 'reconnecting' });
        };
      } catch (e) {
        // Fallback
      }
    },
  };
});

// Dev-only handle for debugging and the e2e scripts.
if (import.meta.env.DEV) {
  (window as unknown as { __labStore: typeof useLabStore }).__labStore = useLabStore;
}
