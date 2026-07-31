// Browser/Tauri runtime polyfill
import "@IMPLEMENT/lib/tauri";

import { Suspense } from "react";
import ReactDOM from "react-dom/client";
import "@DESIGN/index.css";
import "@/modules/i18n"; // Initialize i18n
import { ErrorBoundary } from "@DESIGN/components/ui/ErrorBoundary";
import { lazyWithRetry } from "@TOOL/utils/lazyWithRetry";
import App from "./App";

// Lazy load components to optimize per-window bundle usage
const AnalysisWindow = lazyWithRetry(() => import("@IMPLEMENT/features/analysis/AnalysisWindow"), { moduleName: "AnalysisWindow" });
const PrintWindow = lazyWithRetry(() => import("@DESIGN/features/print/PrintWindow"), { moduleName: "PrintWindow" });
const StreetViewPage = lazyWithRetry(() => import("@DESIGN/features/map/MapLayerComponents/StreetViewPage"), { moduleName: "StreetViewPage" });

const rootElement = document.getElementById("root") as HTMLElement;
const pathname = window.location.pathname;
const searchParams = new URLSearchParams(window.location.search);
let view = searchParams.get('view');

// 🌐 Google Maps Style Path Detection (@lat,lng...)
if (pathname.includes('/@')) {
  view = 'streetview';
}

// Disable default context menu globally
window.addEventListener('contextmenu', (e) => e.preventDefault(), false);

import { I18nextProvider, useTranslation } from "react-i18next";
import i18n from "@/modules/i18n";

const syncViewportSize = () => {
  const root = document.documentElement;
  root.style.setProperty("--app-vw", `${window.innerWidth}px`);
  root.style.setProperty("--app-vh", `${window.innerHeight}px`);
};

syncViewportSize();
window.addEventListener("resize", syncViewportSize);
window.visualViewport?.addEventListener("resize", syncViewportSize);

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
    case 'streetview':
      return <StreetViewPage />;
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
