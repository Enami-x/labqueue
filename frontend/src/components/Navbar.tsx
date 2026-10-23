import React from 'react';
import { useLabStore, TabKey } from '../store/useLabStore';
import {
  Workflow,
  LayoutDashboard,
  GitCompareArrows,
  Layers3,
  Zap,
  Calendar,
  Sparkles,
  Terminal,
  BarChart3,
  CircleHelp,
  Activity,
} from 'lucide-react';

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'overview', label: 'Overview', icon: <LayoutDashboard /> },
  { key: 'compare', label: 'Compare', icon: <GitCompareArrows /> },
  { key: 'profiles', label: 'Profiles', icon: <Layers3 /> },
  { key: 'builder', label: 'Builder', icon: <Zap /> },
  { key: 'calendar', label: 'Calendar', icon: <Calendar /> },
  { key: 'scenarios', label: 'Scenario lab', icon: <Sparkles /> },
  { key: 'live', label: 'Live Console', icon: <Terminal /> },
  { key: 'analytics', label: 'Analytics', icon: <BarChart3 /> },
];

export const Navbar: React.FC = () => {
  const { currentTab, setTab, mode, setMode, liveConnected } = useLabStore();

  return (
    <header className="topbar">
      {/* Brand */}
      <div className="brand" onClick={() => setTab('overview')} role="button">
        <span className="brand-mark">
          <Workflow />
        </span>
        <span>labqueue</span>
        <span className="brand-dot" />
      </div>

      {/* Main Navigation */}
      <nav className="main-nav" aria-label="Main navigation">
        {TABS.map((tab) => {
          const isActive = currentTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setTab(tab.key)}
              className={isActive ? 'nav-item active' : 'nav-item'}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Actions */}
      <div className="top-actions">
        <div className="mode-toggle">
          <button
            onClick={() => setMode('simulation')}
            className={mode === 'simulation' ? 'selected' : ''}
          >
            Sim replay
          </button>
          <button
            onClick={() => setMode('live')}
            className={mode === 'live' ? 'selected' : ''}
          >
            Live OS
          </button>
        </div>

        <button
          className="icon-button"
          aria-label="System status"
          title={liveConnected ? 'System Live' : 'Offline'}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              liveConnected ? 'bg-[#b6f3cf]' : 'bg-[#ffb682]'
            }`}
          />
        </button>

        <div className="avatar" title="Admin User">
          AM
        </div>
      </div>
    </header>
  );
};
