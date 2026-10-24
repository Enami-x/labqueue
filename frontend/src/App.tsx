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
import { TabKey } from './store/useLabStore';
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
  const { currentTab, initApp, loading, error } = useLabStore();

  useEffect(() => {
    initApp();
  }, []);

  return (
    <div className="lab-app flex flex-col text-[#f5f4ed]">
      {/* Top Floating Pill Navigation */}
      <Navbar />

      {/* Global Error Notice if any */}
      {error && (
        <div className="w-[min(1480px,calc(100%-32px))] mx-auto mt-4 p-3.5 rounded-xl bg-[#ffb682]/10 border border-[#ffb682]/30 flex items-center justify-between text-xs text-[#ffb682]">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#ffb682]" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => initApp()}
            className="underline hover:text-white transition font-medium cursor-pointer"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative">
        {loading && (
          <div className="fixed top-5 right-8 z-50 flex items-center gap-2 bg-[#062b25]/90 backdrop-blur-md border border-[rgba(220,237,227,0.2)] px-4 py-1.5 rounded-full text-xs font-semibold text-[#b6f3cf] shadow-2xl">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#b6f3cf]" />
            <span>Simulating...</span>
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
    </div>
  );
};

export default App;
