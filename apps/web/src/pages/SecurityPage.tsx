import { motion } from "framer-motion";
import { SiteFooter, SiteHeader } from "../SiteChrome";
import { Link } from "../router";
import { fadeUp, stagger } from "../motion";
import { Icon } from "../ui/Icon";

const PRINCIPLES = [
  {
    id: "PR-01",
    title: "You own the keys.",
    text: "The keyrig server does not receive your keys. A key goes only to the endpoint that you choose.",
  },
  {
    id: "PR-02",
    title: "Every answer shows its source.",
    text: "Each answer shows the model and the key label that made it.",
  },
  {
    id: "PR-03",
    title: "Cost stays visible.",
    text: "Each answer shows an estimated cost. A price that keyrig does not know shows as unknown.",
  },
  {
    id: "PR-04",
    title: "Failures are clear.",
    text: "keyrig shows a clear error and a next step. It does not fail in silence.",
  },
  {
    id: "PR-05",
    title: "Telemetry is off.",
    text: "keyrig sends no telemetry by default. Crash reports are off too.",
  },
];

const VAULT_POINTS = [
  "Keys are encrypted with AES-GCM before the save.",
  "Your password opens the vault. The password is never stored.",
  "Sign out locks the vault and drops the decrypted keys from memory.",
  "Stop a stream at any time. A partial answer keeps its partial label.",
];

function ShieldDrawing() {
  return (
    <motion.svg
      className="shield-drawing"
      viewBox="0 0 120 140"
      aria-hidden="true"
      initial="hidden"
      animate="show"
    >
      <motion.path
        d="M60 8 104 24v38c0 30-19 54-44 66C35 116 16 92 16 62V24L60 8Z"
        className="shield-outline"
        variants={{ hidden: { pathLength: 0, opacity: 0 }, show: { pathLength: 1, opacity: 1, transition: { duration: 1.6, ease: "easeInOut" } } }}
      />
      <motion.path
        d="M42 70 55 83 80 56"
        className="shield-check"
        variants={{ hidden: { pathLength: 0 }, show: { pathLength: 1, transition: { delay: 1.4, duration: 0.6, ease: "easeOut" } } }}
      />
    </motion.svg>
  );
}

export function SecurityPage() {
  return (
    <div className="site">
      <SiteHeader />
      <main className="page-main">
        <section className="security-hero">
          <motion.div variants={stagger(0.1)} initial="hidden" animate="show">
            <motion.span variants={fadeUp} className="eyebrow eyebrow--amber">
              Security
            </motion.span>
            <motion.h1 variants={fadeUp}>
              Keys stay on <span className="accent">your device.</span>
            </motion.h1>
            <motion.p variants={fadeUp} className="lead">
              keyrig keeps your keys in this browser. It sends a key only to the endpoint that you set. These are the
              product rules that the app follows.
            </motion.p>
            <motion.div variants={fadeUp} className="hero-actions">
              <Link to="/app" className="btn btn--primary btn--lg btn--glow">
                Open keyrig
                <Icon name="arrow" size={15} />
              </Link>
            </motion.div>
          </motion.div>
          <ShieldDrawing />
        </section>

        <section className="section">
          <motion.div className="principles" variants={stagger(0.08)} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }}>
            {PRINCIPLES.map((item) => (
              <motion.article key={item.id} className="principle" variants={fadeUp}>
                <span className="principle-id mono">{item.id}</span>
                <h2>{item.title}</h2>
                <p>{item.text}</p>
              </motion.article>
            ))}
          </motion.div>
        </section>

        <section className="section">
          <motion.div className="vault-panel" variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }}>
            <div>
              <span className="eyebrow eyebrow--cyan">
                <Icon name="lock" size={11} />
                Key vault
              </span>
              <h2>The vault stays on this device.</h2>
              <p>
                keyrig cannot recover a forgotten password. Keep a copy of your password in a safe place.
              </p>
            </div>
            <ul className="band-list">
              {VAULT_POINTS.map((point) => (
                <li key={point}>
                  <span className="band-tick">
                    <Icon name="check" size={12} />
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </motion.div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
