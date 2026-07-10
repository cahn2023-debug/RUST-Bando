// 🛡️ Polyfill Tauri internals for browser development is now centralized in @IMPLEMENT/lib/tauri
import "@IMPLEMENT/lib/tauri";

import { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import "@DESIGN/index.css";
import "@TOOL/../i18n"; // Initialize i18n
import { ErrorBoundary } from "@DESIGN/components/ui/ErrorBoundary";

// Lazy load components to optimize per-window bundle usage
const App = lazy(() => import("./App"));
const AnalysisWindow = lazy(() => import("@IMPLEMENT/features/analysis/AnalysisWindow"));
const PrintWindow = lazy(() => import("@DESIGN/features/print/PrintWindow"));
const StreetViewPage = lazy(() => import("@DESIGN/features/map/MapLayerComponents/StreetViewPage"));

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
import i18n from "@TOOL/../i18n";

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
    <div className="h-full w-full min-h-0 min-w-0 flex items-center justify-center bg-[#16171B] text-cad-text-muted font-mono text-[10px] uppercase tracking-widest animate-pulse">
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
