// Browser/Tauri runtime polyfill
import "@IMPLEMENT/lib/tauri";

import { Suspense } from "react";
import ReactDOM from "react-dom/client";
import "@DESIGN/index.css";
import "@/modules/i18n"; // Initialize i18n
import { ErrorBoundary } from "@DESIGN/components/ui/ErrorBoundary";
import { lazyWithRetry } from "@SHARED/utils/lazyWithRetry";
import App from "./App";

// Lazy load components to optimize per-window bundle usage
const AnalysisWindow = lazyWithRetry(() => import("@IMPLEMENT/features/analysis/AnalysisWindow"), { moduleName: "AnalysisWindow" });
const PrintWindow = lazyWithRetry(() => import("@DESIGN/features/print/PrintWindow"), { moduleName: "PrintWindow" });

const rootElement = document.getElementById("root") as HTMLElement;
const searchParams = new URLSearchParams(window.location.search);
let view = searchParams.get('view');

// Disable default context menu globally
window.addEventListener('contextmenu', (e) => e.preventDefault(), false);

import { I18nextProvider, useTranslation } from "react-i18next";
import i18n from "@/modules/i18n";

let resizeRafId: number | null = null;
const syncViewportSize = () => {
  if (resizeRafId !== null) return;
  resizeRafId = requestAnimationFrame(() => {
    resizeRafId = null;
    const root = document.documentElement;
    root.style.setProperty("--app-vw", `${window.innerWidth}px`);
    root.style.setProperty("--app-vh", `${window.innerHeight}px`);
  });
};

syncViewportSize();
window.addEventListener("resize", syncViewportSize, { passive: true });
window.visualViewport?.addEventListener("resize", syncViewportSize, { passive: true });

const LoadingFallback = () => {
  const { t } = useTranslation();
  return (
    <div className="cad-shell-window items-center justify-center text-cad-text-muted font-mono text-[10px] uppercase tracking-[0.2em] animate-pulse">
      {t("common.loading")}
    </div>
  );
};

const renderContent = () => {
  switch (view) {
    case 'analysis':
      return <AnalysisWindow />;
    case 'print':
      return <PrintWindow />;
    default:
      return <App />;
  }
};

ReactDOM.createRoot(rootElement).render(
  <I18nextProvider i18n={i18n}>
    <ErrorBoundary>
      <Suspense fallback={<LoadingFallback />}>
        {renderContent()}
      </Suspense>
    </ErrorBoundary>
  </I18nextProvider>
);
