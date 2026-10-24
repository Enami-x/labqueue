import React, { useEffect, useRef } from 'react';
import { useLabStore } from '../store/useLabStore';
import { Play, Pause, RotateCcw, Zap } from 'lucide-react';
import { fmtT, unitOf } from '../lib/format';

const STEP = 5;
const BIG_STEP = 15;

/** Keys aimed at a control belong to that control, not to the transport. */
const isInteractive = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.closest('input, textarea, select, button, a, [role="combobox"], [role="slider"], [contenteditable="true"], [role="dialog"], [role="alertdialog"]') !== null);

export const ScrubberBar: React.FC = () => {
  const {
    scrubberTime,
    maxScrubberTime,
    isPlaying,
    playbackSpeed,
    togglePlay,
    setScrubberTime,
    setPlaybackSpeed,
    stepForward,
    stepBackward,
    jumpToNextDeadlock,
    runResult,
    mode,
    currentTab,
    selectedJobId,
  } = useLabStore();

  const timelineRef = useRef<HTMLDivElement>(null);
  const unit = unitOf(runResult);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (mode !== 'simulation' || currentTab !== 'overview' || selectedJobId) return;
      if (e.altKey || e.ctrlKey || e.metaKey || isInteractive(e.target)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        stepForward(e.shiftKey ? BIG_STEP : STEP);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        stepBackward(e.shiftKey ? BIG_STEP : STEP);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, stepForward, stepBackward, mode, currentTab, selectedJobId]);

  if (mode === 'live') return null;

  const progressPct = maxScrubberTime > 0 ? (scrubberTime / maxScrubberTime) * 100 : 0;

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || maxScrubberTime <= 0) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setScrubberTime(Math.round(pct * maxScrubberTime));
  };

  const onSliderKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? BIG_STEP : STEP;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') stepForward(step);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') stepBackward(step);
    else if (e.key === 'Home') setScrubberTime(0);
    else if (e.key === 'End') setScrubberTime(maxScrubberTime);
    else if (e.key === ' ') togglePlay();
    else return;
    e.preventDefault();
  };

  const markers: { pct: number; kind: 'deadlock' | 'policy'; label: string }[] = [];
  if (runResult?.events && maxScrubberTime > 0) {
    for (const ev of runResult.events) {
      if (ev.type === 'DEADLOCK_DETECTED') {
        markers.push({ pct: (ev.t / maxScrubberTime) * 100, kind: 'deadlock', label: `Deadlock at ${fmtT(ev.t, unit)}` });
      } else if (ev.type === 'PROFILE_SWITCHED') {
        markers.push({ pct: (ev.t / maxScrubberTime) * 100, kind: 'policy', label: `${fmtT(ev.t, unit)}: policy → ${ev.to}` });
      }
    }
  }
  const stepLabel = `${STEP}${unit === 's' ? 's' : 'm'}`;

  return (
    <section className="scrubber panel" aria-label="Replay controls">
      <div className="transport">
        <button className="small-button" onClick={() => setScrubberTime(0)} aria-label="Rewind to start" title="Rewind to start">
          <RotateCcw />
        </button>
        <button className="small-button" onClick={() => stepBackward(STEP)} aria-label={`Step back ${stepLabel}`} title="Step back (←)">
          −{stepLabel}
        </button>
        <button className="play-button" onClick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'} title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}>
          {isPlaying ? <Pause /> : <Play />}
        </button>
        <button className="small-button" onClick={() => stepForward(STEP)} aria-label={`Step forward ${stepLabel}`} title="Step forward (→)">
          +{stepLabel}
        </button>
        <button className="small-button" onClick={jumpToNextDeadlock} aria-label="Jump to next deadlock" title="Jump to next deadlock">
          <Zap />
        </button>
      </div>

      <div className="timeline">
        <div className="timeline-times">
          <span>{fmtT(0, unit)}</span>
          <strong aria-live="off">{fmtT(scrubberTime, unit)}</strong>
          <span>{fmtT(maxScrubberTime, unit)}</span>
        </div>
        <div
          ref={timelineRef}
          className="timeline-line"
          onClick={handleTimelineClick}
          onKeyDown={onSliderKey}
          tabIndex={0}
          role="slider"
          aria-label="Replay position"
          aria-valuenow={Math.round(scrubberTime)}
          aria-valuemin={0}
          aria-valuemax={maxScrubberTime}
          aria-valuetext={fmtT(scrubberTime, unit)}
        >
          <span className="timeline-dot" style={{ left: `${Math.min(100, Math.max(0, progressPct))}%` }} />
          {markers.map((m, idx) => (
            <span key={idx} className={`timeline-mark ${m.kind}`} style={{ left: `${m.pct}%` }} title={m.label} />
          ))}
        </div>
      </div>

      <div className="speed-control" role="group" aria-label="Playback speed">
        <span>Speed</span>
        {[1, 5, 20, 60].map((speed) => (
          <button
            key={speed}
            className={playbackSpeed === speed ? 'speed active' : 'speed'}
            aria-pressed={playbackSpeed === speed}
            onClick={() => setPlaybackSpeed(speed)}
          >
            {speed}×
          </button>
        ))}
      </div>
    </section>
  );
};
