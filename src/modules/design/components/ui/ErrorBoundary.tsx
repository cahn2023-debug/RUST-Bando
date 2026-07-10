import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCcw, ShieldAlert } from "lucide-react";
import i18n from "@TOOL/../i18n";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

const t = (key: string): string => {
  return i18n.t(key);
};

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[Uncaught Error]", error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="h-full w-full min-h-0 min-w-0 bg-[#0A0A0B] flex items-center justify-center p-6 font-sans">
          <div className="max-w-2xl w-full bg-cad-surface border-2 border-red-500/50 rounded-sm shadow-[0_0_50px_rgba(239,68,68,0.15)] overflow-hidden">
            <div className="bg-red-500/10 border-b border-red-500/20 p-4 flex items-center gap-3">
              <ShieldAlert className="text-red-500" size={24} />
              <h1 className="text-white font-display font-black uppercase tracking-tighter text-lg">{t('errors.generic')}</h1>
            </div>

            <div className="p-8">
              <div className="flex items-start gap-6">
                <div className="p-4 bg-red-500/10 rounded-lg">
                  <AlertTriangle className="text-red-500" size={32} />
                </div>
                <div className="flex-1">
                  <h2 className="text-white font-bold mb-2">{t('errors.saveFailed')}</h2>
                  <p className="text-cad-text-muted text-xs leading-relaxed mb-6">
                    {t('errors.loadFailed')}
                  </p>
                  
                  <div className="bg-black/40 border border-cad-border p-4 rounded mb-6 overflow-auto max-h-48 custom-scrollbar">
                    <p className="text-red-400 font-mono text-[10px] whitespace-pre-wrap">
                      {this.state.error?.stack || this.state.error?.toString()}
                    </p>
                  </div>

                  <div className="flex gap-4">
                    <button
                      onClick={this.handleReset}
                      className="flex-1 bg-red-500 hover:bg-red-600 text-white font-black uppercase text-[10px] tracking-widest py-3 rounded-sm transition-all flex items-center justify-center gap-2"
                    >
                      <RefreshCcw size={14} /> {t('common.refresh').toUpperCase()}
                    </button>
                    <button
                      onClick={() => {
                        localStorage.clear();
                        window.location.reload();
                      }}
                      className="px-6 border border-cad-border hover:border-white text-cad-text-muted hover:text-white font-bold uppercase text-[10px] tracking-widest transition-all"
                    >
                      {t('common.reset').toUpperCase()}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="bg-cad-bg p-3 flex justify-center border-t border-cad-border">
              <span className="text-[9px] font-mono text-cad-text-muted uppercase tracking-widest">Antigravity Design Engine v4.0.2 • Debug Mode Active</span>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
