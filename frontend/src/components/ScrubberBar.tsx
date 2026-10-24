import React, { useEffect, useRef } from 'react';
import { useLabStore } from '../store/useLabStore';
import { Play, Pause, RotateCcw, Zap } from 'lucide-react';

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
  } = useLabStore();

  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        stepForward(e.shiftKey ? 15 : 5);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        stepBackward(e.shiftKey ? 15 : 5);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, stepForward, stepBackward]);

  if (mode === 'live') {
    return null;
  }

  const formatTime = (t: number) => {
    const mins = Math.floor(t / 60);
    const secs = Math.floor(t % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progressPct = maxScrubberTime > 0 ? (scrubberTime / maxScrubberTime) * 100 : 0;

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || maxScrubberTime <= 0) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    setScrubberTime(Math.round(pct * maxScrubberTime));
  };

  // Find deadlock event times
  const markers: { pct: number; kind: 'deadlock' | 'policy'; label: string }[] = [];
  if (runResult?.events && maxScrubberTime > 0) {
    for (const ev of runResult.events) {
      if (ev.type === 'DEADLOCK_DETECTED') {
        markers.push({ pct: (ev.t / maxScrubberTime) * 100, kind: 'deadlock', label: `Deadlock at T+${ev.t}m` });
      } else if (ev.type === 'PROFILE_SWITCHED') {
        markers.push({ pct: (ev.t / maxScrubberTime) * 100, kind: 'policy', label: `T+${ev.t}m: policy → ${ev.to}` });
      }
    }
  }

  return (
    <section className="scrubber panel">
      {/* Transport Controls */}
      <div className="transport">
        <button
          className="small-button"
          onClick={() => setScrubberTime(0)}
          aria-label="Reset to T=0"
          title="Reset to T=0"
        >
          <RotateCcw />
        </button>
        <button
          className="small-button"
          onClick={() => stepBackward(5)}
          aria-label="Step back 5 seconds"
          title="Step back 5s"
        >
          −5s
        </button>
        <button
          className="play-button"
          onClick={togglePlay}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
        >
          {isPlaying ? <Pause /> : <Play />}
        </button>
        <button
          className="small-button"
          onClick={() => stepForward(5)}
          aria-label="Step forward 5 seconds"
          title="Step forward 5s"
        >
          +5s
        </button>
        <button
          className="small-button"
          onClick={jumpToNextDeadlock}
          aria-label="Jump to next deadlock"
          title="Jump to Next Deadlock"
        >
          <Zap />
        </button>
      </div>

      {/* Timeline Scrubbing Track */}
      <div className="timeline">
        <div className="timeline-times">
          <span>T = 00:00</span>
          <strong>{formatTime(scrubberTime)}</strong>
          <span>{formatTime(maxScrubberTime)}</span>
        </div>
        <div
          ref={timelineRef}
          className="timeline-line"
          onClick={handleTimelineClick}
          role="slider"
          aria-valuenow={scrubberTime}
          aria-valuemin={0}
          aria-valuemax={maxScrubberTime}
        >
          <span className="timeline-dot" style={{ left: `${Math.min(100, Math.max(0, progressPct))}%` }} />
          {markers.map((m, idx) => (
            <span
              key={idx}
              className={`timeline-mark ${m.kind}`}
              style={{ left: `${m.pct}%` }}
              title={m.label}
            />
          ))}
        </div>
      </div>

      {/* Speed Multiplier */}
      <div className="speed-control">
        <span>Speed</span>
        {[1, 5, 20, 60].map((speed) => (
          <button
            key={speed}
            className={playbackSpeed === speed ? 'speed active' : 'speed'}
            onClick={() => setPlaybackSpeed(speed)}
          >
            {speed}×
          </button>
        ))}
      </div>
    </section>
  );
};
