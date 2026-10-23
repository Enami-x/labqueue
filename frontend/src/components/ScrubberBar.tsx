import React, { useEffect } from 'react';
import { useLabStore } from '../store/useLabStore';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  AlertTriangle,
  Clock,
  Gauge,
  Sliders,
} from 'lucide-react';

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
    replayState,
    mode,
  } = useLabStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        stepForward(e.shiftKey ? 15 : 2);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        stepBackward(e.shiftKey ? 15 : 2);
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

  const hasDeadlocks = (runResult?.metrics?.deadlocks_detected || 0) > 0;
  const progressPct = maxScrubberTime > 0 ? (scrubberTime / maxScrubberTime) * 100 : 0;

  return (
    <div className="px-4 mb-3">
      <div className="plume-card rounded-2xl px-5 py-3 flex flex-col gap-3">
        {/* Main controls row */}
        <div className="flex items-center justify-between gap-4">
          {/* Playback Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setScrubberTime(0)}
              title="Reset to T=0"
              className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/[0.08] transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => stepBackward(5)}
              title="Step Back 5s"
              className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/[0.08] transition"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={togglePlay}
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              className={`px-4 py-2 rounded-xl flex items-center gap-2 text-xs font-semibold transition-all shadow-md ${
                isPlaying
                  ? 'bg-amber-500 text-slate-950 hover:bg-amber-400 shadow-amber-500/20'
                  : 'bg-gradient-to-r from-indigo-500 to-sky-400 text-white hover:from-indigo-400 hover:to-sky-300 shadow-indigo-500/25'
              }`}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current" />
              )}
              <span>{isPlaying ? 'PAUSE' : 'REPLAY'}</span>
            </button>
            <button
              onClick={() => stepForward(5)}
              title="Step Forward 5s"
              className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/[0.08] transition"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>

            {hasDeadlocks && (
              <button
                onClick={jumpToNextDeadlock}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 transition shadow-sm"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                <span>Next Deadlock</span>
              </button>
            )}
          </div>

          {/* Time & Active Policy */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-white/[0.04] px-3 py-1.5 rounded-xl border border-white/[0.08] text-xs font-mono">
              <Clock className="w-3.5 h-3.5 text-sky-400" />
              <span className="text-slate-400">T =</span>
              <span className="text-white font-bold tracking-wider">
                {formatTime(scrubberTime)}
              </span>
              <span className="text-slate-500">/</span>
              <span className="text-slate-400">{formatTime(maxScrubberTime)}</span>
            </div>

            {replayState?.active_profile_name && (
              <div className="hidden sm:flex items-center gap-2 bg-white/[0.04] px-3 py-1.5 rounded-xl border border-white/[0.08] text-xs">
                <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-slate-400">Active Policy:</span>
                <span className="text-indigo-300 font-semibold font-mono">
                  {replayState.active_profile_name}
                </span>
              </div>
            )}
          </div>

          {/* Speed Selector */}
          <div className="flex items-center gap-1 bg-white/[0.04] p-1 rounded-xl border border-white/[0.08] text-xs font-mono">
            <Gauge className="w-3.5 h-3.5 text-slate-400 ml-1.5" />
            {[1, 5, 20, 60].map((s) => (
              <button
                key={s}
                onClick={() => setPlaybackSpeed(s)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                  playbackSpeed === s
                    ? 'bg-indigo-600 text-white font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        {/* Timeline Slider with Progress */}
        <div className="relative flex items-center group pt-1">
          <input
            type="range"
            min={0}
            max={maxScrubberTime || 100}
            step={0.5}
            value={scrubberTime}
            onChange={(e) => setScrubberTime(parseFloat(e.target.value))}
            aria-label="Simulation Timeline Scrubber"
            className="w-full cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
};
