import { Link } from "../app/router";
import { SiteFooter, SiteHeader } from "../app/SiteChrome";
import { Icon } from "../components/ui/Icon";
import { AgentSection } from "./settings/AgentSection";
import { AppearanceSection } from "./settings/AppearanceSection";
import { AppSection } from "./settings/AppSection";
import { ConnectorsSection } from "./settings/ConnectorsSection";
import { GuardrailsSection } from "./settings/GuardrailsSection";
import { PluginsSection } from "./settings/PluginsSection";
import { SkillsSection } from "./settings/SkillsSection";

const INDEX = [
  { id: "appearance", label: "Appearance" },
  { id: "app", label: "App" },
  { id: "guardrails", label: "Guardrails" },
  { id: "agent", label: "Agent tools" },
  { id: "skills", label: "Skills" },
  { id: "connectors", label: "Connectors" },
  { id: "plugins", label: "Plugins" },
];

/** `/settings`. Each section is one file in `pages/settings/`. */
export function SettingsPage() {
  return (
    <div className="site">
      <SiteHeader />
      <main className="page-main settings">
        <header className="page-hero settings-hero">
          <span className="eyebrow eyebrow--amber">Settings</span>
          <h1>
            Make it <span className="accent">yours.</span>
          </h1>
          <p className="lead">
            The look, the saved prompts and the provider packs. Everything here stays in this browser.
          </p>
        </header>

        <nav className="settings-index" aria-label="Settings sections">
          {INDEX.map((item) => (
            <a key={item.id} className="settings-index-link" href={`#${item.id}`}>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="settings-stack">
          <AppearanceSection />
          <AppSection />
          <GuardrailsSection />
          <AgentSection />
          <SkillsSection />
          <ConnectorsSection />
          <PluginsSection />
        </div>

        <p className="settings-foot">
          <Link to="/app" className="text-link">
            Back to the workspace
            <Icon name="arrow" size={13} />
          </Link>
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
