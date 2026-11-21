import { Component, type ReactNode } from "react";

/**
 * The last stop between a crashed view and a blank page. A render throw anywhere in the tree
 * used to unmount everything and leave the user on a white screen with no way out but reload.
 * The boundary keeps the chrome standing, says what happened in plain words, and offers back
 * two roads: retry the view, or go to the dashboard.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; onDashboard?: () => void; label?: string },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // One line with the route stack; no PII beyond what the view already had in memory.
    console.error("dashboard.render_error", error.message, info?.componentStack?.split("\n").slice(0, 6).join(" | "));
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="mx-auto mt-16 grid max-w-md justify-items-center gap-4 text-center" role="alert">
        <h1 className="text-[20px] font-semibold tracking-tight">Something in this view crashed</h1>
        <p className="text-[13.5px] text-ink-2">
          The rest of the app is fine. The error was logged; retry the view, or go back to the dashboard. If it keeps
          happening, send the message below to whoever runs this server.
        </p>
        <pre className="max-h-40 w-full overflow-auto rounded-lg border border-line bg-panel-2 p-3 text-left font-mono text-[11.5px] text-ink-2">
          {error.message}
        </pre>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-full border border-line-strong px-4 py-2 text-[13.5px] hover:bg-panel-2"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
          {this.props.onDashboard ? (
            <button
              type="button"
              className="rounded-full bg-solid px-4 py-2 text-[13.5px] font-medium text-on-solid hover:brightness-95"
              onClick={this.props.onDashboard}
            >
              Back to the dashboard
            </button>
          ) : null}
        </div>
      </div>
    );
  }
}
