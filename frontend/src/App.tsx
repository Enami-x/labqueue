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
    <div className="min-h-screen flex flex-col plume-ambient text-slate-100 font-sans">
      {/* Top Floating Navigation Bar */}
      <Navbar />

      {/* Global Error Banner if any */}
      {error && (
        <div className="mx-4 mb-3 p-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-between text-xs text-rose-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => initApp()}
            className="underline hover:text-white transition font-medium"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {loading && (
          <div className="absolute top-2 right-6 z-50 flex items-center gap-2 bg-slate-900/80 backdrop-blur-md border border-white/[0.1] px-3.5 py-1.5 rounded-full text-xs font-medium text-sky-300 shadow-xl">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400" />
            <span>Simulating...</span>
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
