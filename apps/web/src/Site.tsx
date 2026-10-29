import { AnimatePresence, MotionConfig, motion, useScroll, useSpring } from "framer-motion";
import App from "./App";
import { HomePage } from "./pages/HomePage";
import { ProvidersPage } from "./pages/ProvidersPage";
import { SecurityPage } from "./pages/SecurityPage";
import { Link, useRoute, type Route } from "./router";
import { EASE_OUT } from "./motion";

function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 30, restDelta: 0.001 });
  return <motion.div className="scroll-progress" style={{ scaleX }} aria-hidden="true" />;
}

function NotFoundPage() {
  return (
    <div className="site">
      <main className="not-found">
        <span className="eyebrow eyebrow--amber">404</span>
        <h1>This page does not exist.</h1>
        <Link to="/" className="btn btn--ghost">
          Back to home
        </Link>
      </main>
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

  return (
    <MotionConfig reducedMotion="user">
      <ScrollProgress />
      <div hidden={!onWorkspace}>
        <App />
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {onWorkspace ? null : (
          <motion.div
            key={route}
            className="page"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.32, ease: EASE_OUT }}
          >
            {renderPage(route)}
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
