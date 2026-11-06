import { useState, type ComponentProps } from "react";
import { AuthPanel } from "../../components/AuthPanel";
import { VaultScene } from "../../components/VaultScene";
import { Icon } from "../../components/ui/Icon";
import { browserStorage } from "../../lib/storage";
import { markVaultSceneSkipped, readVaultSceneSkipped } from "../../lib/vaultScene";
import { SiteFooter, SiteHeader } from "../SiteChrome";

type AuthHandlers = ComponentProps<typeof AuthPanel>;

/** The stage that a visitor sees before sign-in. It holds no key and no chat. */
export function SignedOutStage(handlers: AuthHandlers) {
  /** Backlog #10: a skip belongs to this browser, so a reload keeps the choice. */
  const [sceneSkipped, setSceneSkipped] = useState(() => readVaultSceneSkipped(browserStorage()));
  const skipScene = (): void => {
    markVaultSceneSkipped(browserStorage());
    setSceneSkipped(true);
  };

  return (
    <div className="app">
      <SiteHeader
        actions={
          <span className="status-chip" data-state="locked">
            <span className="status-dot" />
            <span>Signed out</span>
          </span>
        }
      />

      <main className="auth-stage">
        <div className="auth-intro">
          <span className="hero-badge">
            <Icon name="shield" size={12} />
            Keys stay in this browser. They go only to your provider.
          </span>
          <h1>
            One key. <span className="accent">Every model.</span>
          </h1>
          <p>
            keyrig is a BYOK harness. Create an account on this device, add your provider keys once, and route each
            prompt to the model that fits. Every answer shows its model, its key label and its estimated cost.
          </p>
          {sceneSkipped ? null : <VaultScene onSkip={skipScene} />}
        </div>
        <AuthPanel {...handlers} />
      </main>

      <SiteFooter />
    </div>
  );
}
