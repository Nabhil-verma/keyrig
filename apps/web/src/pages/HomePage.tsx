import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useInView,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { BUILTIN_MANIFESTS } from "@keyrig/providers";
import { SiteFooter, SiteHeader } from "../app/SiteChrome";
import { Link } from "../app/router";
import { EASE_OUT, fadeUp, stagger } from "../lib/motion";
import { KeyRigObject } from "../components/KeyRigObject";
import { Icon, type IconName } from "../components/ui/Icon";

/** The three nodes of the routing visual. Each node has one example answer. */
const EXAMPLES = [
  {
    provider: "Anthropic",
    model: "claude-sonnet-4-5",
    keyLabel: "work",
    tokens: "1,204 in · 386 out",
    cost: "$0.0031 estimated",
    priced: true,
    text: "Route each prompt to the model that fits the task.",
  },
  {
    provider: "OpenAI",
    model: "gpt-5.4",
    keyLabel: "personal",
    tokens: "812 in · 240 out",
    cost: "$0.0021 estimated",
    priced: true,
    text: "Compare two drafts. Keep the answer that reads better.",
  },
  {
    provider: "Ollama",
    model: "llama3.2",
    keyLabel: "local",
    tokens: "640 in · 198 out",
    cost: "price unknown",
    priced: false,
    text: "Run a local model on your own machine. No key leaves this device.",
  },
] as const;

const VIEWPORT = { once: true, margin: "-80px" } as const;

function LineReveal({ children, delay = 0, className }: { children: string; delay?: number; className?: string }) {
  return (
    <span className={`hp-line ${className ?? ""}`}>
      <motion.span
        variants={{
          hidden: { y: "108%" },
          show: { y: "0%", transition: { duration: 0.95, delay, ease: EASE_OUT } },
        }}
      >
        {children}
      </motion.span>
    </span>
  );
}

function CountUp({ to }: { to: number }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!inView) {
      return;
    }
    const controls = animate(0, to, {
      duration: 1.2,
      ease: "easeOut",
      onUpdate: (latest) => setValue(Math.round(latest)),
    });
    return () => controls.stop();
  }, [inView, to]);

  return <span ref={ref}>{value}</span>;
}

/** The hero glow follows the pointer. The glow is a CSS gradient driven by two variables. */
function Hero() {
  const onPointerMove = (event: ReactPointerEvent<HTMLElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--hx", `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty("--hy", `${event.clientY - rect.top}px`);
  };

  return (
    <section className="hp-hero" onPointerMove={onPointerMove}>
      <div className="hp-hero-grid" aria-hidden="true" />
      <div className="hp-hero-glow" aria-hidden="true" />

      <div className="hp-wrap hp-hero-inner">
        <div className="hp-hero-copy">
          <motion.p
            className="hp-kicker"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
          >
            <span className="hp-kicker-dot" />
            BYOK AI harness
            <span className="hp-kicker-rule" />
            Keys stay on this device
          </motion.p>

          <motion.h1 className="hp-display" variants={stagger(0.1, 0.15)} initial="hidden" animate="show">
            <LineReveal>One key.</LineReveal>
            <LineReveal delay={0.08} className="hp-line--cyan">
              Every model.
            </LineReveal>
            <LineReveal delay={0.16} className="hp-line--outline">
              No middleman.
            </LineReveal>
          </motion.h1>

          <motion.p
            className="hp-lead"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.42, ease: EASE_OUT }}
          >
            keyrig is a BYOK AI harness. Add your provider keys once. Send each prompt to the model that fits.
            Every answer shows its model, its key label and the estimated cost.
          </motion.p>

          <motion.div
            className="hp-actions"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.52, ease: EASE_OUT }}
          >
            <Link to="/app" className="btn btn--primary btn--lg btn--glow">
              Open keyrig
              <Icon name="arrow" size={15} />
            </Link>
            <Link to="/security" className="btn btn--ghost btn--lg">
              Read the security model
            </Link>
          </motion.div>

          <motion.ul
            className="hp-proof"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.62 }}
          >
            <li>
              <Icon name="globe" size={13} /> No server
            </li>
            <li>
              <Icon name="eyeOff" size={13} /> Zero telemetry
            </li>
            <li>
              <Icon name="check" size={13} /> MIT license
            </li>
          </motion.ul>
        </div>

        <motion.div
          className="hp-hero-object"
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, delay: 0.2, ease: EASE_OUT }}
        >
          <span className="hp-object-label hp-object-label--amber">
            <span /> Key
          </span>
          <span className="hp-object-label hp-object-label--cyan">
            <span /> Link
          </span>
          <KeyRigObject />
        </motion.div>
      </div>

      <div className="hp-wrap">
        <ProvenanceBar />
      </div>

      <span className="hp-scroll" aria-hidden="true">
        Scroll
        <span className="hp-scroll-line" />
      </span>
    </section>
  );
}

/** One example answer with its provenance. It cycles while the visitor reads the hero. */
function ProvenanceBar() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setActive((value) => (value + 1) % EXAMPLES.length), 4200);
    return () => window.clearInterval(timer);
  }, []);

  const example = EXAMPLES[active] ?? EXAMPLES[0];

  return (
    <div className="hp-prov">
      <span className="hp-prov-label">
        <span className="hp-live-dot" />
        Live example
      </span>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={example.model}
          className="hp-prov-body"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3, ease: EASE_OUT }}
        >
          <p className="hp-prov-answer">{example.text}</p>
          <span className="hp-prov-chips">
            <span className="chip chip--cyan">
              <Icon name="cpu" size={10} />
              {example.model}
            </span>
            <span className="chip">
              <Icon name="key" size={10} />
              {example.keyLabel}
            </span>
            <span className="chip">{example.tokens}</span>
            <span className={`chip ${example.priced ? "" : "chip--amber"}`}>
              <Icon name="wallet" size={10} />
              {example.cost}
            </span>
          </span>
        </motion.div>
      </AnimatePresence>

      <span className="hp-prov-count mono">
        {String(active + 1).padStart(2, "0")} / {String(EXAMPLES.length).padStart(2, "0")}
      </span>
    </div>
  );
}

function ProviderTicker() {
  const names = BUILTIN_MANIFESTS.map((manifest) => manifest.displayName);
  const row = [...names, ...names];
  return (
    <div className="hp-ticker" aria-label="Supported providers">
      <motion.div
        className="hp-ticker-track"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: 34, ease: "linear", repeat: Infinity }}
      >
        {row.map((name, index) => (
          <span key={`${name}-${index}`} className="hp-ticker-item" aria-hidden={index >= names.length}>
            {name}
            <span className="hp-ticker-mark" />
          </span>
        ))}
      </motion.div>
    </div>
  );
}

const FACTS = [
  { value: BUILTIN_MANIFESTS.length, label: "provider types in one manifest format", note: "PV-02" },
  { value: 3, label: "facts on every answer: model, key label, cost", note: "PR-02" },
  { value: 0, label: "keyrig servers that hold a key", note: "PR-01" },
];

function Ledger() {
  return (
    <section className="hp-section">
      <div className="hp-wrap">
        <div className="hp-statement">
          <span className="hp-index">01 — The harness</span>
          <h2 className="hp-statement-text">
            Your key is the only credential. It never leaves <em>this device</em>.
          </h2>
        </div>

        <motion.div
          className="hp-ledger"
          variants={stagger(0.08)}
          initial="hidden"
          whileInView="show"
          viewport={VIEWPORT}
        >
          {FACTS.map((fact) => (
            <motion.div key={fact.label} className="hp-ledger-cell" variants={fadeUp}>
              <span className="hp-ledger-value">
                <CountUp to={fact.value} />
              </span>
              <span className="hp-ledger-label">{fact.label}</span>
              <span className="hp-ledger-note mono">{fact.note}</span>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

interface RouteCardProps {
  item: (typeof EXAMPLES)[number];
  index: number;
  progress: MotionValue<number>;
}

/**
 * One card of the deck. At the start of the section the cards sit in a stack.
 * As the visitor scrolls, the cards fan out in 3D and land in a readable row.
 */
function RouteCard({ item, index, progress }: RouteCardProps) {
  const offset = index - 1;
  const x = useTransform(progress, [0.12, 0.62], [`${offset * 5}%`, `${offset * 108}%`]);
  const y = useTransform(progress, [0.12, 0.62], [index * 16, 0]);
  const z = useTransform(progress, [0.12, 0.62], [-190, 0]);
  const rotateY = useTransform(progress, [0.12, 0.62], [offset * -20, 0]);
  const rotateX = useTransform(progress, [0.12, 0.62], [9, 0]);
  const opacity = useTransform(progress, [0.08, 0.34], [0.45, 1]);
  const scale = useTransform(progress, [0.12, 0.62], [0.94, 1]);

  return (
    <motion.article
      className="hp-card"
      style={{ x, y, z, rotateY, rotateX, opacity, scale }}
      aria-label={`${item.provider} ${item.model}`}
    >
      <header className="hp-card-head">
        <span className="hp-card-provider">{item.provider}</span>
        <span className="hp-card-index mono">0{index + 1}</span>
      </header>

      <p className="hp-card-model mono">{item.model}</p>
      <p className="hp-card-text">{item.text}</p>

      <div className="hp-card-chips">
        <span className="chip">
          <Icon name="key" size={10} />
          {item.keyLabel}
        </span>
        <span className="chip">{item.tokens}</span>
        <span className={`chip ${item.priced ? "chip--cyan" : "chip--amber"}`}>
          <Icon name="wallet" size={10} />
          {item.cost}
        </span>
      </div>

      <footer className="hp-card-foot mono">
        <span>keyrig routes one prompt</span>
        <span>{item.priced ? "priced" : "local"}</span>
      </footer>
    </motion.article>
  );
}

function RouteScene() {
  const ref = useRef<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const progress = useSpring(scrollYProgress, { stiffness: 90, damping: 28, restDelta: 0.001 });

  return (
    <section className="hp-scene" id="rig" ref={ref}>
      <div className="hp-stage">
        <div className="hp-wrap hp-stage-head">
          <span className="hp-index">02 — The rig</span>
          <h2 className="hp-h2">One prompt. Three routes. One clear answer.</h2>
          <p className="hp-stage-note">
            Scroll to fan out the rig. Each card keeps the model, the key label and the cost of its answer.
          </p>
        </div>

        <div className="hp-deck">
          {EXAMPLES.map((item, index) => (
            <RouteCard key={item.provider} item={item} index={index} progress={progress} />
          ))}
        </div>

        <div className="hp-wrap hp-stage-foot mono" aria-hidden="true">
          <span>one hub</span>
          <span>three nodes</span>
          <span>no shared state</span>
        </div>
      </div>
    </section>
  );
}

interface FeatureSpec {
  icon: IconName;
  title: string;
  text: string;
  span: number;
  note: string;
}

const FEATURES: FeatureSpec[] = [
  {
    icon: "lock",
    title: "Encrypted vault",
    text: "Your password opens an AES-GCM vault on this device. keyrig never stores the password.",
    span: 7,
    note: "KS-01",
  },
  {
    icon: "route",
    title: "Route per prompt",
    text: "Pick a provider and a model for each prompt. Change them at any time.",
    span: 5,
    note: "PV-03",
  },
  {
    icon: "arena",
    title: "Model arena",
    text: "Send one prompt to many models. Compare time, cost and answer side by side.",
    span: 4,
    note: "UX-01",
  },
  {
    icon: "wallet",
    title: "Cost in view",
    text: "Each answer shows input tokens, output tokens and an estimated cost.",
    span: 4,
    note: "CO-01",
  },
  {
    icon: "check",
    title: "Provenance",
    text: "The model and the key label stay with the answer. A model swap shows a notice.",
    span: 4,
    note: "PR-02",
  },
  {
    icon: "cpu",
    title: "Local models too",
    text: "Connect Ollama, LM Studio or any OpenAI-compatible server on your machine. A local route needs no key.",
    span: 12,
    note: "PV-05",
  },
];

/** A feature cell. The cell glow follows the pointer through two CSS variables. */
function FeatureCell({ spec }: { spec: FeatureSpec }) {
  const onPointerMove = (event: ReactPointerEvent<HTMLElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--mx", `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty("--my", `${event.clientY - rect.top}px`);
  };

  return (
    <motion.article
      className={`hp-cell hp-cell--${spec.span}`}
      variants={fadeUp}
      onPointerMove={onPointerMove}
    >
      <div className="hp-cell-head">
        <span className="hp-cell-icon">
          <Icon name={spec.icon} size={16} />
        </span>
        <span className="hp-cell-num mono">{spec.note}</span>
      </div>
      <h3 className="hp-cell-title">{spec.title}</h3>
      <p className="hp-cell-text">{spec.text}</p>
    </motion.article>
  );
}

function Features() {
  return (
    <section className="hp-section" id="features">
      <div className="hp-wrap">
        <div className="hp-section-head">
          <span className="hp-index">03 — The parts</span>
          <div>
            <h2 className="hp-h2">The parts that matter.</h2>
            <p className="hp-section-note">
              Six rules shape the app. Each rule has an ID that a test can prove.
            </p>
          </div>
        </div>

        <motion.div
          className="hp-grid"
          variants={stagger(0.06)}
          initial="hidden"
          whileInView="show"
          viewport={VIEWPORT}
        >
          {FEATURES.map((spec) => (
            <FeatureCell key={spec.title} spec={spec} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}

const STEPS = [
  {
    num: "01",
    title: "Create an account",
    text: "Your username and password open a vault on this device. keyrig never stores the password.",
  },
  {
    num: "02",
    title: "Add a key",
    text: "Save a provider key. keyrig encrypts the key before the save.",
  },
  {
    num: "03",
    title: "Choose a model",
    text: "Pick a provider and a model. Change them at any time.",
  },
  {
    num: "04",
    title: "Send a prompt",
    text: "Read the answer with its model, key label and estimated cost.",
  },
];

function Protocol() {
  return (
    <section className="hp-section" id="how">
      <div className="hp-wrap hp-steps">
        <motion.div
          className="hp-steps-intro"
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={VIEWPORT}
        >
          <span className="hp-index">04 — The protocol</span>
          <h2 className="hp-h2">From an empty device to a routed answer.</h2>
          <p className="hp-section-note">
            A key goes only to the endpoint that you choose. Sign out and the vault locks.
          </p>
          <Link to="/app" className="text-link">
            Open keyrig
            <Icon name="arrow" size={14} />
          </Link>
        </motion.div>

        <ol className="hp-step-list">
          {STEPS.map((step, index) => (
            <motion.li
              key={step.num}
              className="hp-step"
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={VIEWPORT}
              transition={{ delay: index * 0.04 }}
            >
              <span className="hp-step-num mono">{step.num}</span>
              <div className="hp-step-body">
                <h3 className="hp-step-title">{step.title}</h3>
                <p className="hp-step-text">{step.text}</p>
              </div>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const SECURITY_POINTS = [
  "Keys are encrypted in this browser with your password.",
  "No keyrig server receives a key.",
  "Telemetry is off by default.",
  "A forgotten password cannot be recovered.",
];

function SecuritySeal() {
  return (
    <div className="hp-seal" aria-hidden="true">
      <svg viewBox="0 0 220 220" className="hp-seal-svg" focusable="false">
        <circle className="hp-seal-ring hp-seal-ring--outer" cx="110" cy="110" r="86" />
        <circle className="hp-seal-ring hp-seal-ring--inner" cx="110" cy="110" r="66" />
        <path className="hp-seal-check" d="M84 112 102 130 138 92" />
        <circle className="hp-seal-hub" cx="110" cy="110" r="3" />
      </svg>
      <span className="hp-seal-label mono">PR-01 / PR-05</span>
    </div>
  );
}

function SecurityBand() {
  return (
    <motion.section
      className="hp-band"
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={VIEWPORT}
    >
      <div className="hp-wrap hp-band-inner">
        <div className="hp-band-copy">
          <span className="hp-index">05 — The boundary</span>
          <h2 className="hp-h2">Your keys go only to the endpoint you choose.</h2>
          <Link to="/security" className="text-link">
            Read the product rules
            <Icon name="arrow" size={14} />
          </Link>
        </div>

        <ul className="hp-band-list">
          {SECURITY_POINTS.map((point) => (
            <li key={point}>
              <span className="hp-band-tick">
                <Icon name="check" size={12} />
              </span>
              {point}
            </li>
          ))}
        </ul>

        <SecuritySeal />
      </div>
    </motion.section>
  );
}

function FinalCta() {
  return (
    <section className="hp-cta">
      <div className="hp-wrap hp-cta-inner">
        <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={VIEWPORT}>
          <span className="hp-index">06 — Start</span>
          <h2 className="hp-cta-title">
            <span>Bring your keys.</span>
            <span className="hp-cta-title-soft">Keep the control.</span>
          </h2>
        </motion.div>

        <motion.div
          className="hp-cta-side"
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={VIEWPORT}
        >
          <p>Open keyrig in this browser. Create an account on this device. Add one key.</p>
          <Link to="/app" className="btn btn--primary btn--lg btn--glow">
            Open keyrig
            <Icon name="arrow" size={15} />
          </Link>
          <span className="hp-cta-note mono">No server · Zero telemetry · MIT</span>
        </motion.div>
      </div>
    </section>
  );
}

export function HomePage() {
  return (
    <div className="site hp">
      <div className="hp-grain" aria-hidden="true" />
      <SiteHeader />
      <main className="hp-main">
        <Hero />
        <ProviderTicker />
        <Ledger />
        <RouteScene />
        <Features />
        <Protocol />
        <SecurityBand />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
