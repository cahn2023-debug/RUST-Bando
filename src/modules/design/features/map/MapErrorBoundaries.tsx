import { Component, ErrorInfo, ReactNode } from "react";

interface BasemapErrorBoundaryProps {
  children: ReactNode;
}

interface BasemapErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class BasemapErrorBoundary extends Component<
  BasemapErrorBoundaryProps,
  BasemapErrorBoundaryState
> {
  public state: BasemapErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): BasemapErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("[BasemapErrorBoundary] Map basemap crashed:", error, errorInfo);
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gray-200 text-gray-800 p-4">
          <p className="font-semibold text-sm mb-2">Bản đồ gặp lỗi khi hiển thị.</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 transition"
          >
            Thử lại bản đồ
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
      // Return null so basemap remains intact and operational
      return null;
    }
    return this.props.children;
  }
}
