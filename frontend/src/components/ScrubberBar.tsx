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
  FastForward,
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

  // Keyboard shortcut: Space toggles play/pause
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
    return null; // Scrubber is for simulation replay mode
  }

  const formatTime = (t: number) => {
    const mins = Math.floor(t / 60);
    const secs = Math.floor(t % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const hasDeadlocks = (runResult?.metrics?.deadlocks_detected || 0) > 0;

  return (
    <div className="w-full bg-cr-surface/90 border-b border-cr-border px-4 py-2.5 backdrop-blur-md">
      <div className="flex flex-col gap-2">
        {/* Main controls row */}
        <div className="flex items-center justify-between gap-4">
          {/* Playback Buttons */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setScrubberTime(0)}
              title="Reset to T=0"
              className="p-1.5 rounded-lg bg-cr-card hover:bg-cr-cardHover text-slate-300 hover:text-white border border-cr-border transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => stepBackward(5)}
              title="Step Back 5s"
              className="p-1.5 rounded-lg bg-cr-card hover:bg-cr-cardHover text-slate-300 hover:text-white border border-cr-border transition"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={togglePlay}
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-semibold transition border ${
                isPlaying
                  ? 'bg-cr-amber/20 text-cr-amber border-cr-amber/40 cr-glow-amber'
                  : 'bg-cr-cyan/20 text-cr-cyan border-cr-cyan/40 cr-glow-cyan'
              }`}
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
              <span>{isPlaying ? 'PAUSE' : 'PLAY'}</span>
            </button>
            <button
              onClick={() => stepForward(5)}
              title="Step Forward 5s"
              className="p-1.5 rounded-lg bg-cr-card hover:bg-cr-cardHover text-slate-300 hover:text-white border border-cr-border transition"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>

            {/* Jump to Deadlock if present */}
            {hasDeadlocks && (
              <button
                onClick={jumpToNextDeadlock}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-mono font-medium rounded-lg bg-cr-rose/20 text-cr-rose border border-cr-rose/40 hover:bg-cr-rose/30 transition cr-glow-rose"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Next Deadlock</span>
              </button>
            )}
          </div>

          {/* Time & Active Profile display */}
          <div className="flex items-center gap-3 font-mono">
            <div className="flex items-center gap-2 bg-cr-card px-3 py-1 rounded-lg border border-cr-border text-xs">
              <Clock className="w-3.5 h-3.5 text-cr-cyan" />
              <span className="text-slate-400">T =</span>
              <span className="text-cr-cyan font-bold tracking-wider">
                {formatTime(scrubberTime)}
              </span>
              <span className="text-slate-500">/</span>
              <span className="text-slate-400">{formatTime(maxScrubberTime)}</span>
            </div>

            {replayState?.active_profile_name && (
              <div className="hidden sm:flex items-center gap-1.5 bg-cr-card px-2.5 py-1 rounded-lg border border-cr-border text-[11px] text-slate-300">
                <span className="text-slate-500">POLICY:</span>
                <span className="text-cr-emerald font-semibold font-mono">
                  {replayState.active_profile_name}
                </span>
              </div>
            )}
          </div>

          {/* Speed Selector */}
          <div className="flex items-center gap-1 bg-cr-card p-1 rounded-lg border border-cr-border text-xs font-mono">
            <FastForward className="w-3.5 h-3.5 text-slate-400 ml-1" />
            {[1, 5, 20, 60].map((s) => (
              <button
                key={s}
                onClick={() => setPlaybackSpeed(s)}
                className={`px-2 py-0.5 rounded text-[11px] transition ${
                  playbackSpeed === s
                    ? 'bg-cr-cyan/30 text-cr-cyan font-bold border border-cr-cyan/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        {/* Timeline Slider with Progress */}
        <div className="relative flex items-center group">
          <input
            type="range"
            min={0}
            max={maxScrubberTime || 100}
            step={0.5}
            value={scrubberTime}
            onChange={(e) => setScrubberTime(parseFloat(e.target.value))}
            aria-label="Simulation Timeline Scrubber"
            className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cr-cyan focus:outline-none transition-all duration-100"
          />
        </div>
      </div>
    </div>
  );
};
