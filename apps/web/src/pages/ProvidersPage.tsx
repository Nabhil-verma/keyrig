import { motion } from "framer-motion";
import { BUILTIN_MANIFESTS, type ProviderManifest } from "@keyrig/providers";
import { SiteFooter, SiteHeader } from "../SiteChrome";
import { Link } from "../router";
import { fadeUp, stagger } from "../motion";
import { Icon } from "../ui/Icon";

const AUTH_LABEL: Record<ProviderManifest["authType"], string> = {
  "api-key": "API key required",
  none: "No key",
  "api-key-optional": "Key optional",
};

const PRICE_LABEL: Record<string, string> = {
  "models.dev": "Catalog prices",
  local: "Local, no price",
  none: "No price source",
};

const ABILITY_LABEL: Array<[keyof ProviderManifest["abilities"], string]> = [
  ["streaming", "streaming"],
  ["tools", "tools"],
  ["images", "vision"],
  ["reasoning", "reasoning"],
  ["promptCache", "prompt cache"],
  ["modelList", "model list"],
];

function ProviderCard({ manifest }: { manifest: ProviderManifest }) {
  const abilities = ABILITY_LABEL.filter(([key]) => manifest.abilities[key]);
  return (
    <motion.article className="provider-card" variants={fadeUp} whileHover={{ y: -4 }} transition={{ duration: 0.25 }}>
      <header className="provider-head">
        <span className="provider-glyph mono">{manifest.displayName.slice(0, 2).toUpperCase()}</span>
        <div>
          <h2>{manifest.displayName}</h2>
          <span className="eyebrow">{AUTH_LABEL[manifest.authType]}</span>
        </div>
      </header>

      <dl className="provider-facts">
        <div>
          <dt>Wire format</dt>
          <dd className="mono">{manifest.wireFormat}</dd>
        </div>
        <div>
          <dt>Prices</dt>
          <dd>{PRICE_LABEL[manifest.priceSource] ?? manifest.priceSource}</dd>
        </div>
        <div>
          <dt>Default base URL</dt>
          <dd className="mono">{manifest.baseUrl}</dd>
        </div>
        <div>
          <dt>Custom base URL</dt>
          <dd>{manifest.supportsCustomBaseUrl ? "Allowed, with a check" : "Not offered"}</dd>
        </div>
      </dl>

      <div className="ability-row">
        {abilities.map(([, label]) => (
          <span key={label} className="chip chip--plain">
            {label}
          </span>
        ))}
      </div>

      <footer className="provider-foot">
        <Link to="/app" className="text-link">
          Use in the app
          <Icon name="arrow" size={14} />
        </Link>
      </footer>
    </motion.article>
  );
}

export function ProvidersPage() {
  return (
    <div className="site">
      <SiteHeader />
      <main className="page-main">
        <motion.header className="page-hero" variants={stagger(0.1)} initial="hidden" animate="show">
          <motion.span variants={fadeUp} className="eyebrow eyebrow--cyan">
            Providers
          </motion.span>
          <motion.h1 variants={fadeUp}>
            Every provider. <span className="accent">One route.</span>
          </motion.h1>
          <motion.p variants={fadeUp} className="lead">
            keyrig reads each provider from one manifest. Provider quirks stay in the manifest. They do not appear
            in the interface or in the agent loop.
          </motion.p>
        </motion.header>

        <motion.div className="provider-grid" variants={stagger(0.09)} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }}>
          {BUILTIN_MANIFESTS.map((manifest) => (
            <ProviderCard key={manifest.id} manifest={manifest} />
          ))}
        </motion.div>
      </main>
      <SiteFooter />
    </div>
  );
}
