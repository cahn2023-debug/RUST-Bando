import { Component, ErrorInfo, ReactNode } from "react";

interface OverlayErrorBoundaryProps {
  children?: ReactNode;
  onError?: (error: Error) => void;
}

interface OverlayErrorBoundaryState {
  hasError: boolean;
}

export class OverlayErrorBoundary extends Component<
  OverlayErrorBoundaryProps,
  OverlayErrorBoundaryState
> {
  public state: OverlayErrorBoundaryState = {
    hasError: false,
  };

  public static getDerivedStateFromError(): OverlayErrorBoundaryState {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("[OverlayErrorBoundary] Feature overlay crashed:", error, errorInfo);
    if (this.props.onError) {
      this.props.onError(error);
    }
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}
