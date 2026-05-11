import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (typeof console !== "undefined") {
      console.error("[AppErrorBoundary]", error, info);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    if (typeof window !== "undefined") window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-black px-4">
        <div className="max-w-md w-full border border-[#DC143C]/30 bg-[#0f0f0f] p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-9 h-9 border border-[#DC143C]/35 bg-[#DC143C]/8 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-[#DC143C]" />
            </div>
            <div>
              <div className="terminal text-[10px] text-[#DC143C]/70 uppercase tracking-[0.15em] font-black">System Fault</div>
              <h1 className="font-black text-base uppercase tracking-tight text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Something broke</h1>
            </div>
          </div>
          <p className="terminal text-[11px] text-white/55 leading-relaxed mb-1">
            {">"} An unexpected error interrupted this view.
          </p>
          <p className="terminal text-[11px] text-white/40 leading-relaxed mb-5">
            {">"} Try recovering, or reload the app.
          </p>
          {this.state.error?.message && (
            <pre className="terminal text-[10px] text-[#DC143C]/60 bg-black border border-[#DC143C]/15 p-2 mb-4 overflow-auto max-h-24 whitespace-pre-wrap">
              {this.state.error.message}
            </pre>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={this.handleReset}
              className="flex-1 bg-[#E8754A] text-black border-[#E8754A] font-black uppercase tracking-wider text-[11px] hover:bg-[#E8754A]/90"
            >
              <RefreshCw className="w-3 h-3 mr-1" /> Try Again
            </Button>
            <Button
              size="sm"
              onClick={this.handleReload}
              className="flex-1 bg-transparent border border-white/20 text-white/70 hover:border-white/40 hover:text-white font-bold uppercase tracking-wider text-[11px]"
            >
              Reload
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

export default AppErrorBoundary;
