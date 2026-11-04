import { Link } from "../app/router";
import { SiteFooter, SiteHeader } from "../app/SiteChrome";
import { Icon } from "../components/ui/Icon";
import { AppearanceSection } from "./settings/AppearanceSection";
import { AppSection } from "./settings/AppSection";
import { ConnectorsSection } from "./settings/ConnectorsSection";
import { GuardrailsSection } from "./settings/GuardrailsSection";
import { KeysSection } from "./settings/KeysSection";
import { PluginsSection } from "./settings/PluginsSection";
import { ProfileSection } from "./settings/ProfileSection";
import { SkillsSection } from "./settings/SkillsSection";
import { ToolsSection } from "./settings/ToolsSection";

const INDEX = [
  { id: "profile", label: "Profile" },
  { id: "appearance", label: "Appearance" },
  { id: "tools", label: "Tools" },
  { id: "keys", label: "Keys" },
  { id: "app", label: "App" },
  { id: "guardrails", label: "Guardrails" },
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
            The profile, the look, the tools, the keys and the saved prompts. Everything here stays in this
            browser.
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
          <ProfileSection />
          <AppearanceSection />
          <ToolsSection />
          <KeysSection />
          <AppSection />
          <GuardrailsSection />
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
