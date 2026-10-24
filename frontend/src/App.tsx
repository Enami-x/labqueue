import React, { useEffect } from 'react';
import { useLabStore } from './store/useLabStore';
import { Navbar } from './components/Navbar';
import { OverviewPage } from './pages/OverviewPage';
import { ComparePage } from './pages/ComparePage';
import { ProfileExplorerPage } from './pages/ProfileExplorerPage';
import { ProfileBuilderPage } from './pages/ProfileBuilderPage';
import { CalendarPage } from './pages/CalendarPage';
import { ScenarioLabPage } from './pages/ScenarioLabPage';
import { LiveConsolePage } from './pages/LiveConsolePage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { TabKey, tabFromHash } from './store/useLabStore';
import { ConfirmDialog, Toaster } from './components/ui';
import { JobDrawer } from './components/JobDrawer';
import { AlertTriangle, Loader2 } from 'lucide-react';

const PAGES: Record<TabKey, { label: string; component: React.FC }> = {
  overview: { label: 'Overview', component: OverviewPage },
  compare: { label: 'Compare', component: ComparePage },
  profiles: { label: 'Profiles', component: ProfileExplorerPage },
  builder: { label: 'Builder', component: ProfileBuilderPage },
  calendar: { label: 'Calendar', component: CalendarPage },
  scenarios: { label: 'Scenario lab', component: ScenarioLabPage },
  live: { label: 'Live Console', component: LiveConsolePage },
  analytics: { label: 'Analytics', component: AnalyticsPage },
};

export const App: React.FC = () => {
  const { currentTab, initApp, loading, error, setTab } = useLabStore();

  useEffect(() => {
    initApp();
    // Back/forward and manual hash edits switch tabs without pushing history.
    const onHash = () => {
      const tab = tabFromHash();
      if (tab && tab !== useLabStore.getState().currentTab) setTab(tab, true);
    };
    if (!window.location.hash) window.history.replaceState(null, '', `#/${useLabStore.getState().currentTab}`);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <div className="lab-app flex flex-col text-[#f5f4ed]">
      <Navbar />

      {error && (
        <div className="page-shell" style={{ paddingBottom: 0 }}>
          <div className="notice" role="alert">
            <AlertTriangle />
            <span style={{ flex: 1 }}>{error}</span>
            <button className="ghost-button" style={{ padding: '6px 10px' }} onClick={() => initApp()}>
              Retry
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col relative" id="main">
        {loading && (
          <div className="fixed bottom-5 left-5 z-50 flex items-center gap-2 bg-[#062b25]/90 backdrop-blur-md border border-[rgba(220,237,227,0.2)] px-4 py-1.5 rounded-full text-xs font-semibold text-[#b6f3cf] shadow-2xl" role="status">
            <Loader2 className="w-3.5 h-3.5 spinner" aria-hidden="true" />
            <span>Simulating…</span>
          </div>
        )}

        <ErrorBoundary scope="page" key={currentTab} name={PAGES[currentTab].label}>
          {currentTab === 'overview' ? (
            <OverviewPage />
          ) : (
            <div className="page-shell">{React.createElement(PAGES[currentTab].component)}</div>
          )}
        </ErrorBoundary>
      </main>

      <JobDrawer />
      <Toaster />
      <ConfirmDialog />
    </div>
  );
};

export default App;
