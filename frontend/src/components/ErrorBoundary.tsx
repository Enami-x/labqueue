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
        <div className="min-h-screen bg-[#031f1b] flex items-center justify-center p-6 text-[#f5f4ed]">
          <div className="max-w-lg w-full bg-[#062b25] border border-[#ffb682]/40 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-[#ffb682]/15 text-[#ffb682] border border-[#ffb682]/30">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-bold uppercase tracking-tight text-white">
                  Application Notice
                </h2>
                <p className="text-xs text-[#99aaa5]">
                  An error occurred while mounting dashboard telemetry.
                </p>
              </div>
            </div>

            {this.state.error && (
              <pre className="bg-black/30 p-3 rounded-xl border border-[rgba(220,237,227,0.12)] text-xs font-mono text-[#ffb682] overflow-x-auto whitespace-pre-wrap">
                {this.state.error.toString()}
              </pre>
            )}

            <button
              onClick={() => window.location.reload()}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-[#b6f3cf] hover:brightness-110 text-[#031f1b] rounded-xl font-bold text-xs transition"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reload Mission Control</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
