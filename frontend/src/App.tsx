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
import { AlertTriangle, Loader2 } from 'lucide-react';

export const App: React.FC = () => {
  const { currentTab, initApp, loading, error } = useLabStore();

  useEffect(() => {
    initApp();
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-cr-bg cr-grid-bg text-slate-100">
      {/* Top Control Room Navigation Bar */}
      <Navbar />

      {/* Global Error Banner if any */}
      {error && (
        <div className="bg-cr-rose/20 border-b border-cr-rose/40 px-4 py-2 flex items-center justify-between text-xs font-mono text-cr-rose">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => initApp()}
            className="underline hover:text-white transition font-bold"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {loading && (
          <div className="absolute top-2 right-4 z-50 flex items-center gap-2 bg-cr-card/90 border border-cr-border px-3 py-1.5 rounded-lg text-xs font-mono text-cr-cyan shadow-lg">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Processing...</span>
          </div>
        )}

        {currentTab === 'overview' && <OverviewPage />}
        {currentTab === 'compare' && <ComparePage />}
        {currentTab === 'profiles' && <ProfileExplorerPage />}
        {currentTab === 'builder' && <ProfileBuilderPage />}
        {currentTab === 'calendar' && <CalendarPage />}
        {currentTab === 'scenarios' && <ScenarioLabPage />}
        {currentTab === 'live' && <LiveConsolePage />}
        {currentTab === 'analytics' && <AnalyticsPage />}
      </main>
    </div>
  );
};

export default App;
