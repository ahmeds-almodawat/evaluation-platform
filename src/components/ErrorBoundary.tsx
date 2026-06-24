import React from "react";
import { Button } from "@/components/ui/button";

type Props = React.PropsWithChildren;

type State = {
  hasError: boolean;
  error?: unknown;
};

/**
 * Prevents the "white screen" problem by rendering a friendly fallback UI
 * when something throws at runtime.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown) {
    // Keep console logging so the dev can still see the stack trace.
    // eslint-disable-next-line no-console
    console.error("UI crashed:", error);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoLogin = () => {
    window.location.href = "/auth";
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const message =
      this.state.error instanceof Error ? this.state.error.message : "Unexpected error";

    return (
      <div className="min-h-screen w-full bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-xl rounded-2xl border bg-card p-6 shadow-sm">
          <div className="text-xl font-semibold">Something went wrong</div>
          <div className="mt-2 text-sm text-muted-foreground">
            The page failed to load. You can reload, or go back to the login screen.
          </div>
          <div className="mt-4 rounded-lg bg-muted/40 p-3 text-xs font-mono text-muted-foreground break-words">
            {message}
          </div>
          <div className="mt-6 flex gap-3">
            <Button onClick={this.handleReload}>Reload</Button>
            <Button variant="outline" onClick={this.handleGoLogin}>
              Go to Login
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
