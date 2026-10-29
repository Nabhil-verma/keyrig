import { type ReactNode } from "react";
import { motion } from "framer-motion";
import { Link, useRoute, type Route } from "./router";
import { useSettings, writeSettings } from "./settings";
import type { Theme } from "./theme";
import { BrandLockup } from "./ui/BrandLockup";
import { BrandMark } from "./ui/BrandMark";
import { Icon } from "./ui/Icon";

const PUBLIC_LINKS: ReadonlyArray<{ to: Route; label: string }> = [
  { to: "/providers", label: "Providers" },
  { to: "/security", label: "Security" },
  { to: "/settings", label: "Settings" },
];

function PublicNav({ route }: { route: Route }) {
  return (
    <nav className="site-nav" aria-label="Main">
      {PUBLIC_LINKS.map((item) => {
        const active = route === item.to;
        return (
          <Link key={item.to} to={item.to} className="nav-link" aria-current={active ? "page" : undefined}>
            {active ? (
              <motion.span
                layoutId="nav-pill"
                className="nav-pill"
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              />
            ) : null}
            <span className="nav-label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

interface SiteHeaderProps {
  /** Replaces the public navigation. The app page passes its workspace tabs. */
  nav?: ReactNode;
  /** Replaces the default call to action. The app page passes its status and sign-out. */
  actions?: ReactNode;
}

export function SiteHeader({ nav, actions }: SiteHeaderProps) {
  const route = useRoute();
  const settings = useSettings();
  const prefersLight =
    typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: light)").matches;
  const theme: Theme =
    settings.theme === "system" ? (prefersLight ? "light" : "dark") : settings.theme;

  const themeButton = (
    <button
      type="button"
      className="icon-button"
      aria-label={theme === "dark" ? "Switch to the light theme" : "Switch to the dark theme"}
      title={theme === "dark" ? "Light theme" : "Dark theme"}
      onClick={() => writeSettings({ theme: theme === "dark" ? "light" : "dark" })}
    >
      <Icon name={theme === "dark" ? "sun" : "moon"} size={16} />
    </button>
  );

  return (
    <header className="topbar">
      <Link to="/" className="brand" aria-label="keyrig home">
        <BrandLockup height={34} />
        <span className="brand-pill">BYOK AI HARNESS</span>
      </Link>

      {nav ?? <PublicNav route={route} />}

      <div className="topbar-meta">
        {actions ?? (
          <Link to="/app" className="btn btn--primary btn--sm">
            Open app
            <Icon name="arrow" size={13} />
          </Link>
        )}
        {themeButton}
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <span className="footer-brand">
        <BrandMark size={16} />
        keyrig
        <span className="footer-sep" />
        BYOK AI harness
      </span>
      <span className="footer-links">
        <Link to="/providers">Providers</Link>
        <Link to="/security">Security</Link>
        <Link to="/settings">Settings</Link>
        <Link to="/app">App</Link>
      </span>
      <span>No server · Zero telemetry · MIT</span>
    </footer>
  );
}
