import { Suspense, lazy, useEffect, useState } from "react";
import { MotionConfig, motion, useScroll, useSpring } from "framer-motion";
import { HomePage } from "./pages/HomePage";
import { SecurityPage } from "./pages/SecurityPage";

// The two heavy pages load on the first visit. The home page keeps the first paint.
const ProvidersPage = lazy(() =>
  import("./pages/ProvidersPage").then((module) => ({ default: module.ProvidersPage })),
);
const SettingsPage = lazy(() =>
  import("./pages/SettingsPage").then((module) => ({ default: module.SettingsPage })),
);
// The workspace loads on the first visit to /app, then stays mounted.
const Workspace = lazy(() => import("./App"));
import { Link, useRoute, type Route } from "./router";
import { SiteFooter, SiteHeader } from "./SiteChrome";
import { EASE_OUT } from "./motion";
import { useSettings } from "./settings";

function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 30, restDelta: 0.001 });
  return <motion.div className="scroll-progress" style={{ scaleX }} aria-hidden="true" />;
}

function NotFoundPage() {
  return (
    <div className="site">
      <SiteHeader />
      <main className="not-found">
        <span className="eyebrow eyebrow--amber">404</span>
        <h1>This page does not exist.</h1>
        <Link to="/" className="btn btn--ghost">
          Back to home
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}

function PageFallback() {
  return (
    <div className="site">
      <SiteHeader />
      <main className="page-main" aria-busy="true">
        <span className="eyebrow eyebrow--amber">Loading</span>
      </main>
      <SiteFooter />
    </div>
  );
}

function renderPage(route: Exclude<Route, "/app">) {
  switch (route) {
    case "/":
      return <HomePage />;
    case "/providers":
      return <ProvidersPage />;
    case "/security":
      return <SecurityPage />;
    case "/settings":
      return <SettingsPage />;
    case "not-found":
      return <NotFoundPage />;
  }
}

/**
 * The workspace stays mounted while the visitor reads the public pages. A chat
 * and an unlocked vault therefore survive a trip to the home page.
 */
export function Site() {
  const route = useRoute();
  const onWorkspace = route === "/app";
  const settings = useSettings();
  /** Mount the workspace on the first /app visit, then keep its state. */
  const [workspaceReady, setWorkspaceReady] = useState(onWorkspace);

  useEffect(() => {
    if (onWorkspace) {
      setWorkspaceReady(true);
    }
  }, [onWorkspace]);

  return (
    <MotionConfig reducedMotion={settings.motion === "reduced" ? "always" : "user"}>
      <ScrollProgress />
      {workspaceReady ? (
        <div hidden={!onWorkspace}>
          <Suspense fallback={null}>
            <Workspace />
          </Suspense>
        </div>
      ) : null}
      {onWorkspace ? null : (
        <motion.div
          key={route}
          className="page"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: EASE_OUT }}
        >
          <Suspense fallback={<PageFallback />}>{renderPage(route)}</Suspense>
        </motion.div>
      )}
    </MotionConfig>
  );
}
