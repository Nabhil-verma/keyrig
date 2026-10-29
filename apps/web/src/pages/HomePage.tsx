import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useInView,
  useMotionTemplate,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import { BUILTIN_MANIFESTS } from "@keyrig/providers";
import { SiteFooter, SiteHeader } from "../SiteChrome";
import { Link } from "../router";
import { EASE_OUT, fadeUp, stagger } from "../motion";
import { BrandMark } from "../ui/BrandMark";
import { Icon, type IconName } from "../ui/Icon";

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

const WORD_LINE = {
  hidden: { y: "105%" },
  show: { y: "0%", transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
};

function LineReveal({ children, className }: { children: string; className?: string }) {
  return (
    <span className="line">
      <motion.span className={className} variants={WORD_LINE}>
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

/** The hero glow follows the pointer. The glow is a CSS gradient driven by motion values. */
function Hero() {
  const ref = useRef<HTMLElement | null>(null);
  const px = useMotionValue(50);
  const py = useMotionValue(30);
  const sx = useSpring(px, { stiffness: 120, damping: 22 });
  const sy = useSpring(py, { stiffness: 120, damping: 22 });
  const spot = useMotionTemplate`radial-gradient(560px circle at ${sx}% ${sy}%, var(--spot), transparent 70%)`;

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    px.set(((event.clientX - rect.left) / rect.width) * 100);
    py.set(((event.clientY - rect.top) / rect.height) * 100);
  };

  return (
    <section ref={ref} className="hero" onPointerMove={onPointerMove}>
      <motion.div className="hero-spot" style={{ background: spot }} aria-hidden="true" />
      <motion.span
        className="orb orb--amber"
        aria-hidden="true"
        animate={{ x: [0, 40, -20, 0], y: [0, -30, 20, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.span
        className="orb orb--cyan"
        aria-hidden="true"
        animate={{ x: [0, -50, 30, 0], y: [0, 40, -20, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="hero-grid">
        <motion.div className="hero-copy" variants={stagger(0.12, 0.1)} initial="hidden" animate="show">
          <motion.span variants={fadeUp} className="hero-badge">
            <Icon name="shield" size={12} />
            Keys stay in this browser. They go only to your provider.
          </motion.span>

          <motion.h1 className="display" variants={stagger(0.12)} initial="hidden" animate="show">
            <LineReveal>One key.</LineReveal>
            <LineReveal className="display-accent">Every model.</LineReveal>
          </motion.h1>

          <motion.p variants={fadeUp} className="lead">
            keyrig is a BYOK AI harness. Add your provider keys once. Route each prompt to the model that
            fits. Every answer shows its model, its key label and its estimated cost.
          </motion.p>

          <motion.div variants={fadeUp} className="hero-actions">
            <Link to="/app" className="btn btn--primary btn--lg btn--glow">
              Open keyrig
              <Icon name="arrow" size={15} />
            </Link>
            <Link to="/security" className="btn btn--ghost btn--lg">
              Read the security model
            </Link>
          </motion.div>

          <motion.ul variants={fadeUp} className="hero-proof">
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
        </motion.div>

        <RoutingVisual />
      </div>
    </section>
  );
}

const HUB = { x: 110, y: 150 };
const NODE_X = 300;
const NODE_Y = [50, 150, 250];

/** The routing visual: one hub, three provider nodes, animated packets and a cycling example answer. */
function RoutingVisual() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setActive((value) => (value + 1) % EXAMPLES.length), 3800);
    return () => window.clearInterval(timer);
  }, []);

  const paths = NODE_Y.map((y) => `M${HUB.x} ${HUB.y} C 200 ${HUB.y}, 220 ${y}, ${NODE_X} ${y}`);
  const example = EXAMPLES[active] ?? EXAMPLES[0];

  return (
    <motion.div
      className="routing"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.9, delay: 0.3, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
    >
      <div className="routing-diagram">
        <svg className="routing-svg" viewBox="0 0 480 300" aria-hidden="true">
          <defs>
            <filter id="packet-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {paths.map((d, index) => (
            <motion.path
              key={d}
              d={d}
              className={index === active ? "route-line route-line--active" : "route-line"}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.4, delay: 0.5 + index * 0.15, ease: "easeInOut" }}
            />
          ))}
          {paths.map((d, index) => (
            <circle key={`packet-${d}`} r="4" className="packet" filter="url(#packet-glow)">
              <animateMotion dur="2.6s" begin={`${index * 0.85}s`} repeatCount="indefinite" path={d} />
            </circle>
          ))}
        </svg>

        <div className="hub" style={{ left: `${(HUB.x / 480) * 100}%`, top: `${(HUB.y / 300) * 100}%` }}>
          <motion.span
            className="hub-ring"
            aria-hidden="true"
            animate={{ scale: [1, 1.35, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: "easeOut" }}
          />
          <span className="hub-core">
            <BrandMark size={52} />
          </span>
        </div>

        {EXAMPLES.map((item, index) => {
          const nodeY = NODE_Y[index] ?? 0;
          return (
            <motion.div
              key={item.provider}
              className="route-node"
              data-active={index === active}
              style={{ left: `${(NODE_X / 480) * 100}%`, top: `${(nodeY / 300) * 100}%` }}
              animate={{ y: [0, -5, 0] }}
              transition={{ duration: 4 + index, repeat: Infinity, ease: "easeInOut" }}
            >
              <span className="route-node-dot" />
              <span className="route-node-name">{item.provider}</span>
              <span className="route-node-model mono">{item.model}</span>
            </motion.div>
          );
        })}
      </div>

      <div className="answer-card" aria-live="polite">
        <div className="answer-head">
          <span className="eyebrow eyebrow--amber">
            <Icon name="spark" size={11} />
            Example answer
          </span>
          <span className="chip chip--plain">{example.keyLabel}</span>
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={example.model}
            className="answer-body"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35 }}
          >
            <p>{example.text}</p>
            <div className="answer-meta">
              <span className="chip chip--cyan">
                <Icon name="cpu" size={10} />
                {example.model}
              </span>
              <span className="chip">{example.tokens}</span>
              <span className={`chip ${example.priced ? "" : "chip--amber"}`}>
                <Icon name="wallet" size={10} />
                {example.cost}
              </span>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function ProviderMarquee() {
  const names = BUILTIN_MANIFESTS.map((manifest) => manifest.displayName);
  const row = [...names, ...names];
  return (
    <div className="marquee" aria-label="Supported providers">
      <motion.div
        className="marquee-track"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: 26, ease: "linear", repeat: Infinity }}
      >
        {row.map((name, index) => (
          <span key={`${name}-${index}`} className="marquee-item" aria-hidden={index >= names.length}>
            {name}
            <span className="marquee-dot" />
          </span>
        ))}
      </motion.div>
    </div>
  );
}

function Stats() {
  const items = [
    { value: BUILTIN_MANIFESTS.length, label: "provider types in one manifest format" },
    { value: 3, label: "facts on every answer: model, key label, cost" },
    { value: 0, label: "keyrig servers that hold a key" },
  ];
  return (
    <motion.section className="stats" variants={stagger(0.1)} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }}>
      {items.map((item) => (
        <motion.div key={item.label} className="stat" variants={fadeUp}>
          <span className="stat-value">
            <CountUp to={item.value} />
          </span>
          <span className="stat-label">{item.label}</span>
        </motion.div>
      ))}
    </motion.section>
  );
}

interface FeatureSpec {
  icon: IconName;
  title: string;
  text: string;
  wide?: boolean;
}

const FEATURES: FeatureSpec[] = [
  {
    icon: "lock",
    title: "Encrypted vault",
    text: "Your password opens an AES-GCM vault on this device. The password is never stored.",
    wide: true,
  },
  { icon: "route", title: "Route per prompt", text: "Pick a provider and a model for each prompt. Change them at any time." },
  { icon: "arena", title: "Model arena", text: "Send one prompt to many models. Compare time, cost and answer side by side." },
  { icon: "wallet", title: "Cost in view", text: "Each answer shows input tokens, output tokens and an estimated cost.", wide: true },
  { icon: "check", title: "Provenance on every reply", text: "The model, the key label and the token count stay with each answer.", wide: true },
  { icon: "cpu", title: "Local models too", text: "Connect Ollama, LM Studio or any OpenAI-compatible server on your machine." },
];

/** A feature card. The card glow follows the pointer through two CSS variables. */
function BentoCard({ spec }: { spec: FeatureSpec }) {
  const onPointerMove = (event: ReactPointerEvent<HTMLElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--mx", `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty("--my", `${event.clientY - rect.top}px`);
  };
  return (
    <motion.article className={`bento-card ${spec.wide ? "bento-card--wide" : ""}`} variants={fadeUp} onPointerMove={onPointerMove}>
      <span className="feature-icon">
        <Icon name={spec.icon} size={16} />
      </span>
      <h3>{spec.title}</h3>
      <p>{spec.text}</p>
    </motion.article>
  );
}

function Features() {
  return (
    <section className="section" id="features">
      <motion.div className="section-head" variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }}>
        <span className="eyebrow eyebrow--cyan">What you get</span>
        <h2>Every answer. Every key. Every cost.</h2>
      </motion.div>
      <motion.div className="bento" variants={stagger(0.08)} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }}>
        {FEATURES.map((spec) => (
          <BentoCard key={spec.title} spec={spec} />
        ))}
      </motion.div>
    </section>
  );
}

const STEPS = [
  { num: "01", title: "Create an account", text: "Your username and password open a vault on this device." },
  { num: "02", title: "Add a key", text: "Save a provider key. keyrig encrypts it before the save." },
  { num: "03", title: "Choose a model", text: "Pick a provider and a model. Change them at any time." },
  { num: "04", title: "Send a prompt", text: "Read the answer with its model, key label and estimated cost." },
];

/** The preview of the active step. The content matches the step on the left. */
function StepFigure({ active }: { active: number }) {
  const step = STEPS[active] ?? STEPS[STEPS.length - 1]!;

  return (
    <aside className="how-figure" aria-label={`Step ${step.num}: ${step.title}`}>
      <div className="figure-head">
        <span className="eyebrow eyebrow--cyan">
          <Icon name="route" size={11} />
          Step {step.num}
        </span>
        <span className="chip chip--plain">{step.title}</span>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step.num}
          className="figure-body"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3, ease: EASE_OUT }}
        >
          {active === 0 ? (
            <div className="figure-stack">
              <div className="figure-row">
                <span className="figure-avatar">A</span>
                <div className="figure-text">
                  <strong>alice</strong>
                  <span className="mono">account on this device</span>
                </div>
                <span className="chip chip--plain">Owner</span>
              </div>
              <div className="figure-panel">
                <span className="figure-glyph">
                  <Icon name="lock" size={15} />
                </span>
                <div className="figure-text">
                  <strong>Vault locked</strong>
                  <p>Your password opens it. keyrig never stores the password.</p>
                </div>
              </div>
              <p className="figure-note mono">AES-GCM · PBKDF2 · this browser only</p>
            </div>
          ) : null}

          {active === 1 ? (
            <div className="figure-stack">
              <div className="figure-panel">
                <span className="figure-glyph figure-glyph--amber">
                  <Icon name="key" size={15} />
                </span>
                <div className="figure-text">
                  <strong>work</strong>
                  <span className="mono">•••••••• 4F2A</span>
                </div>
                <span className="chip chip--amber">encrypted</span>
              </div>
              <div className="figure-row">
                <span className="mono figure-note">openai</span>
                <span className="chip chip--plain">API key</span>
              </div>
              <p className="figure-note mono">The key goes only to api.openai.com.</p>
            </div>
          ) : null}

          {active === 2 ? (
            <div className="figure-stack">
              <ul className="figure-models">
                <li data-active="true">
                  <span>OpenAI</span>
                  <span className="mono">gpt-5.4</span>
                </li>
                <li>
                  <span>Anthropic</span>
                  <span className="mono">claude-sonnet-4-5</span>
                </li>
                <li>
                  <span>Ollama</span>
                  <span className="mono">llama3.2</span>
                </li>
              </ul>
              <p className="figure-note mono">One provider and one model for each prompt.</p>
            </div>
          ) : null}

          {active === 3 ? (
            <div className="figure-stack">
              <p className="figure-prompt">Compare these two drafts.</p>
              <div className="figure-panel figure-panel--answer">
                <p className="figure-answer">The second draft is shorter and keeps the same point.</p>
                <div className="figure-chips">
                  <span className="chip chip--cyan">
                    <Icon name="cpu" size={10} />
                    gpt-5.4
                  </span>
                  <span className="chip">
                    <Icon name="key" size={10} />
                    work
                  </span>
                  <span className="chip">812 in · 240 out</span>
                  <span className="chip">$0.0021 estimated</span>
                </div>
              </div>
            </div>
          ) : null}
        </motion.div>
      </AnimatePresence>

      <div className="figure-foot">
        <span className="figure-dots" aria-hidden="true">
          {STEPS.map((item, index) => (
            <span key={item.num} className="figure-dot" data-active={index === active} />
          ))}
        </span>
        <span>Example data</span>
      </div>
    </aside>
  );
}

function Steps() {
  const ref = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 75%", "end 55%"] });
  const scaleY = useSpring(scrollYProgress, { stiffness: 120, damping: 28 });
  const [active, setActive] = useState(0);
  const stepRefs = useRef<Array<HTMLLIElement | null>>([]);

  // While the list is on screen, the step nearest the middle of the screen sets
  // the figure. A pointer over a step takes over until the next scroll.
  useEffect(() => {
    let frame = 0;
    const pick = (): void => {
      frame = 0;
      const list = ref.current?.getBoundingClientRect();
      if (!list || list.bottom < 0 || list.top > window.innerHeight) {
        return;
      }
      const middle = window.innerHeight / 2;
      let nearest = -1;
      let nearestGap = Infinity;
      stepRefs.current.forEach((node, index) => {
        if (!node) {
          return;
        }
        const rect = node.getBoundingClientRect();
        const gap = Math.abs(rect.top + rect.height / 2 - middle);
        if (gap < nearestGap) {
          nearestGap = gap;
          nearest = index;
        }
      });
      if (nearest >= 0) {
        setActive(nearest);
      }
    };
    const onScroll = (): void => {
      if (frame === 0) {
        frame = requestAnimationFrame(pick);
      }
    };
    pick();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame !== 0) {
        cancelAnimationFrame(frame);
      }
    };
  }, []);

  return (
    <section className="section" id="how">
      <motion.div className="section-head" variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }}>
        <span className="eyebrow eyebrow--amber">How it works</span>
        <h2>From an empty device to a routed answer.</h2>
      </motion.div>
      <div className="how-grid">
        <div className="how-main">
          <div className="timeline" ref={ref}>
            <span className="timeline-track" aria-hidden="true">
              <motion.span className="timeline-fill" style={{ scaleY }} />
            </span>
            <ol className="timeline-list">
              {STEPS.map((step, index) => (
                <motion.li
                  key={step.num}
                  className="timeline-step"
                  data-active={index === active}
                  ref={(node) => {
                    stepRefs.current[index] = node;
                  }}
                  data-index={index}
                  onPointerEnter={() => setActive(index)}
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, margin: "-60px" }}
                >
                  <span className="step-num">{step.num}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.text}</p>
                  </div>
                </motion.li>
              ))}
            </ol>
          </div>
        </div>
        <StepFigure active={active} />
      </div>
    </section>
  );
}

function SecurityBand() {
  const points = [
    "Encrypted in this browser with your password.",
    "No keyrig server receives a key.",
    "Telemetry is off by default.",
    "A forgotten password cannot be recovered.",
  ];
  return (
    <motion.section className="band" variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }}>
      <div className="band-copy">
        <span className="eyebrow eyebrow--cyan">
          <Icon name="shield" size={11} />
          Keys stay local
        </span>
        <h2>Your keys go only to the endpoint you choose.</h2>
        <Link to="/security" className="text-link">
          Read the product rules
          <Icon name="arrow" size={14} />
        </Link>
      </div>
      <ul className="band-list">
        {points.map((point) => (
          <li key={point}>
            <span className="band-tick">
              <Icon name="check" size={12} />
            </span>
            {point}
          </li>
        ))}
      </ul>
    </motion.section>
  );
}

function FinalCta() {
  return (
    <motion.section className="cta" variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }}>
      <span className="cta-mark" aria-hidden="true">
        <BrandMark size={64} />
      </span>
      <h2>Bring your keys. Keep the control.</h2>
      <p>Open keyrig in this browser. Create an account on this device.</p>
      <Link to="/app" className="btn btn--primary btn--lg btn--glow">
        Open keyrig
        <Icon name="arrow" size={15} />
      </Link>
    </motion.section>
  );
}

export function HomePage() {
  return (
    <div className="site">
      <SiteHeader />
      <main className="home">
        <Hero />
        <ProviderMarquee />
        <Stats />
        <Features />
        <Steps />
        <SecurityBand />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
