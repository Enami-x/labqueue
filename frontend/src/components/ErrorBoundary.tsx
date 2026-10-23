import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-cr-bg cr-grid-bg flex items-center justify-center p-6 text-slate-100">
          <div className="max-w-lg w-full bg-cr-surface border border-cr-rose/40 rounded-2xl p-6 shadow-2xl cr-glow-rose space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-cr-rose/20 text-cr-rose border border-cr-rose/40">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-bold font-mono uppercase text-white">
                  Application Render Notice
                </h2>
                <p className="text-xs text-slate-400">
                  An error occurred while mounting dashboard telemetry.
                </p>
              </div>
            </div>

            {this.state.error && (
              <pre className="bg-cr-card p-3 rounded-xl border border-cr-border text-xs font-mono text-cr-rose overflow-x-auto whitespace-pre-wrap">
                {this.state.error.toString()}
              </pre>
            )}

            <button
              onClick={() => window.location.reload()}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-cr-cyan/20 hover:bg-cr-cyan/30 text-cr-cyan border border-cr-cyan/40 rounded-xl font-mono text-xs font-bold transition cr-glow-cyan"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reload Control Room</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
