import React, { useEffect, useRef, useState } from 'react';
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
  Menu,
  X,
} from 'lucide-react';

export const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'overview', label: 'Overview', icon: <LayoutDashboard aria-hidden="true" /> },
  { key: 'compare', label: 'Compare', icon: <GitCompareArrows aria-hidden="true" /> },
  { key: 'profiles', label: 'Profiles', icon: <Layers3 aria-hidden="true" /> },
  { key: 'builder', label: 'Builder', icon: <Zap aria-hidden="true" /> },
  { key: 'calendar', label: 'Calendar', icon: <Calendar aria-hidden="true" /> },
  { key: 'scenarios', label: 'Scenario lab', icon: <Sparkles aria-hidden="true" /> },
  { key: 'live', label: 'Live Console', icon: <Terminal aria-hidden="true" /> },
  { key: 'analytics', label: 'Analytics', icon: <BarChart3 aria-hidden="true" /> },
];

const LINK_TEXT = {
  open: 'Live link: connected',
  connecting: 'Live link: connecting…',
  reconnecting: 'Live link: reconnecting…',
};

const NavItems: React.FC<{ onPick?: () => void }> = ({ onPick }) => {
  const { currentTab, setTab } = useLabStore();
  return (
    <>
      {TABS.map((tab) => (
        <button
          key={tab.key}
          onClick={() => {
            setTab(tab.key);
            onPick?.();
          }}
          className={currentTab === tab.key ? 'nav-item active' : 'nav-item'}
          aria-current={currentTab === tab.key ? 'page' : undefined}
        >
          {tab.icon}
          <span>{tab.label}</span>
        </button>
      ))}
    </>
  );
};

export const Navbar: React.FC = () => {
  const { setTab, mode, setMode, liveLink, liveState } = useLabStore();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!statusOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!statusRef.current?.contains(e.target as Node)) setStatusOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setStatusOpen(false);
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [statusOpen]);

  useEffect(() => {
    if (!drawerOpen) return;
    drawerRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const closeDrawer = () => {
    setDrawerOpen(false);
    menuButtonRef.current?.focus();
  };

  return (
    <header className="topbar">
      <div className="flex items-center gap-1">
        <button
          ref={menuButtonRef}
          className="icon-button menu-button"
          aria-label="Open navigation menu"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
        >
          <Menu />
        </button>
        <button className="brand" onClick={() => setTab('overview')} aria-label="LabQueue home (Overview)">
          <span className="brand-mark">
            <Workflow aria-hidden="true" />
          </span>
          <span className="brand-text">labqueue</span>
          <span className="brand-dot" aria-hidden="true" />
        </button>
      </div>

      <nav className="main-nav" aria-label="Main navigation">
        <NavItems />
      </nav>

      <div className="top-actions">
        <div className="mode-toggle" role="group" aria-label="Data source">
          <button
            onClick={() => setMode('simulation')}
            className={mode === 'simulation' ? 'selected' : ''}
            aria-pressed={mode === 'simulation'}
          >
            Sim replay
          </button>
          <button onClick={() => setMode('live')} className={mode === 'live' ? 'selected' : ''} aria-pressed={mode === 'live'}>
            Live OS
          </button>
        </div>

        <div className="status-wrap" ref={statusRef}>
          <button
            className="icon-button"
            aria-label={LINK_TEXT[liveLink]}
            aria-expanded={statusOpen}
            onClick={() => setStatusOpen((o) => !o)}
          >
            <span className={`conn-dot ${liveLink === 'open' ? 'ok' : ''}`} />
          </button>
          {statusOpen && (
            <div className="status-popover" role="status">
              <b>{LINK_TEXT[liveLink]}</b>
              {liveLink === 'open' && liveState ? (
                <span>
                  Session <span className="mono">{liveState.session_id}</span> · policy {liveState.profile} ·{' '}
                  {liveState.counts.running} running
                </span>
              ) : (
                <span>The WebSocket to the live runner retries automatically. Simulation replay works offline.</span>
              )}
            </div>
          )}
        </div>
      </div>

      {drawerOpen && (
        <>
          <div className="nav-drawer-backdrop" onClick={closeDrawer} />
          <nav className="nav-drawer" aria-label="Main navigation" ref={drawerRef}>
            <div className="nav-drawer-head">
              <span className="brand">
                <span className="brand-mark">
                  <Workflow aria-hidden="true" />
                </span>
                labqueue
              </span>
              <button className="icon-button" aria-label="Close navigation menu" onClick={closeDrawer}>
                <X />
              </button>
            </div>
            <NavItems onPick={closeDrawer} />
          </nav>
        </>
      )}
    </header>
  );
};
