import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { KeyView, RoleId } from "@keyrig/core";
import { formatUsd } from "@keyrig/providers";
import { navigate } from "../router";
import { Icon, type IconName } from "../../components/ui/Icon";
import { browserStorage } from "../../lib/storage";
import {
  arenaRuns,
  greetingName,
  keyLabelText,
  readDashboardRecords,
  recentChats,
  weekCost,
  type ArenaRunCard,
  type RecentChat,
  type WeekCost,
} from "../../lib/dashboard";
import type { AgentSettings } from "../../stores/toolSettings";
import type { StoredThread } from "../../stores/threads";
import type { SpendDay } from "../../stores/spendStore";
import { readStreak, streakSummary, type StreakState } from "../../lib/streak";

type CardState = "loading" | "ready" | "error";

interface DashboardProps {
  username: string;
  displayName: string;
  role: RoleId | null;
  keys: KeyView[];
  agentSettings: AgentSettings;
  threads: StoredThread[];
  spendDays: SpendDay[];
  onNewChat: () => void;
  onOpenThread: (thread: StoredThread) => void;
  onOpenArena: () => void;
  onOpenKeys: () => void;
}

interface Loaded {
  recent: RecentChat[];
  arenas: ArenaRunCard[];
  week: WeekCost;
  streak: StreakState;
}

const QUICK_STARTS: ReadonlyArray<{ id: string; label: string; hint: string; icon: IconName }> = [
  { id: "new", label: "New chat", hint: "Ask one question with the route that you saved.", icon: "chat" },
  { id: "arena", label: "Open the arena", hint: "Send one prompt to several models.", icon: "arena" },
  { id: "keys", label: "Add a key", hint: "The key stays encrypted in this browser.", icon: "key" },
  { id: "settings", label: "Change the look", hint: "Theme, density, font size and width.", icon: "settings" },
];

function DashboardCard({
  title,
  hint,
  icon,
  state,
  onRetry,
  children,
  empty,
  wide,
}: {
  title: string;
  hint: string;
  icon: IconName;
  state: CardState;
  onRetry?: () => void;
  children: ReactNode;
  /** The text of the empty state. An empty string shows the children. */
  empty: string;
  wide?: boolean;
}) {
  return (
    <section className={`dash-card${wide === true ? " dash-card--wide" : ""}`} aria-label={title}>
      <header className="dash-card-head">
        <span className="dash-card-icon">
          <Icon name={icon} size={15} />
        </span>
        <div>
          <h2>{title}</h2>
          <p>{hint}</p>
        </div>
      </header>
      <div className="dash-card-body" aria-busy={state === "loading"}>
        {state === "loading" ? (
          <div className="dash-skeleton" role="status">
            <span />
            <span />
            <span />
            <span className="visually-hidden">Loading {title}.</span>
          </div>
        ) : state === "error" ? (
          <div className="dash-error" role="alert">
            <p>keyrig cannot read this record. The browser storage is full or blocked.</p>
            {onRetry ? (
              <button type="button" className="btn btn--ghost btn--sm" onClick={onRetry}>
                <Icon name="refresh" size={12} />
                Try again
              </button>
            ) : null}
          </div>
        ) : empty.length > 0 ? (
          <p className="dash-empty">{empty}</p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

function timeAgo(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) {
    return "";
  }
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} h ago`;
  }
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

/**
 * Phase 1: the Home dashboard.
 *
 * Six cards with clear groups: quick start, recent chats, key status, arena
 * runs, streak and the cost of the week. Each card has a loading, empty and
 * error state. Every number comes from this browser (PR-05).
 */
export function Dashboard({
  username,
  displayName,
  role,
  keys,
  agentSettings,
  threads,
  spendDays,
  onNewChat,
  onOpenThread,
  onOpenArena,
  onOpenKeys,
}: DashboardProps) {
  const [state, setState] = useState<CardState>("loading");
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  const load = useCallback(() => {
    setState("loading");
    let active = true;
    // Read again from the device, so the dashboard shows the saved record.
    void Promise.resolve()
      .then(() => readDashboardRecords(browserStorage(), username))
      .then((records) => {
        if (!active) {
          return;
        }
        setLoaded({
          recent: recentChats(records.threads),
          arenas: arenaRuns(records.threads),
          week: weekCost(records.spendDays),
          streak: records.streak,
        });
        setState("ready");
      })
      .catch(() => {
        if (active) {
          setState("error");
        }
      });
    return () => {
      active = false;
    };
  }, [username]);

  useEffect(() => load(), [load]);

  const week = loaded?.week ?? weekCost(spendDays);
  const recent = loaded?.recent ?? recentChats(threads);
  const arenas = loaded?.arenas ?? arenaRuns(threads);
  const streak = streakSummary(loaded?.streak ?? readStreak(browserStorage()));
  const toolsOn = agentSettings.enabled && agentSettings.acknowledgedVersion > 0;
  const greeting = greetingName(displayName, username);

  const quick = (id: string): void => {
    if (id === "new") {
      onNewChat();
      return;
    }
    if (id === "arena") {
      onOpenArena();
      return;
    }
    if (id === "keys") {
      onOpenKeys();
      return;
    }
    navigate("/settings");
  };

  return (
    <div className="dash">
      <header className="dash-hero">
        <span className="eyebrow eyebrow--amber">Home</span>
        <h1>
          Welcome back, <span className="accent">{greeting}</span>
        </h1>
        <p>
          {role === null
            ? "Your role is not set on this device."
            : `Your role is ${role}. Everything here comes from this browser.`}
        </p>
      </header>

      <div className="dash-grid">
        <section className="dash-card dash-card--wide" aria-label="Quick start">
          <header className="dash-card-head">
            <span className="dash-card-icon">
              <Icon name="spark" size={15} />
            </span>
            <div>
              <h2>Quick start</h2>
              <p>Four ways into the work. No card blocks another.</p>
            </div>
          </header>
          <div className="dash-card-body">
            <div className="dash-quick">
              {QUICK_STARTS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="dash-quick-item"
                  onClick={() => quick(item.id)}
                >
                  <span className="dash-quick-icon">
                    <Icon name={item.icon} size={15} />
                  </span>
                  <span>
                    <strong>{item.label}</strong>
                    <em>{item.hint}</em>
                  </span>
                  <Icon name="arrow" size={13} />
                </button>
              ))}
            </div>
            <div className="dash-facts">
              <span className={`chip ${toolsOn ? "chip--cyan" : "chip--plain"}`}>
                <Icon name="bolt" size={10} />
                {toolsOn ? `${agentSettings.enabledTools.length} tools on` : "tools off"}
              </span>
              <span className="chip chip--plain">
                <Icon name="key" size={10} />
                {keys.length} {keys.length === 1 ? "key" : "keys"}
              </span>
            </div>
          </div>
        </section>

        <DashboardCard
          title="Recent chats"
          hint="The newest saved chats of this account."
          icon="chat"
          state={state}
          onRetry={load}
          empty="No chat yet. Start one with a quick start button."
        >
          <ul className="dash-list">
            {recent.map((chat) => (
              <li key={chat.id}>
                <button
                  type="button"
                  className="dash-row"
                  onClick={() => {
                    const thread = threads.find((item) => item.id === chat.id);
                    if (thread !== undefined) {
                      onOpenThread(thread);
                    }
                  }}
                >
                  <span className="dash-row-main">
                    <strong>{chat.title}</strong>
                    <em>{chat.preview}</em>
                  </span>
                  <span className="dash-row-meta">
                    {timeAgo(chat.updatedAt)}
                    <small>
                      {chat.messageCount} {chat.messageCount === 1 ? "message" : "messages"}
                    </small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </DashboardCard>

        <DashboardCard
          title="Key status"
          hint="Only a label and the last four characters (KS-04)."
          icon="key"
          state="ready"
          empty={keys.length === 0 ? "No key yet. Add one to use a provider that needs a key." : ""}
        >
          <ul className="dash-list">
            {keys.slice(0, 6).map((key) => (
              <li key={key.id} className="dash-key">
                <span className="dash-row-main">
                  <strong className="mono">{keyLabelText(key)}</strong>
                  <em>{key.providerId}</em>
                </span>
                <span className="chip chip--amber">saved</span>
              </li>
            ))}
          </ul>
        </DashboardCard>

        <DashboardCard
          title="Last arena runs"
          hint="One prompt on several models (UX-01)."
          icon="arena"
          state={state}
          onRetry={load}
          empty="No arena run yet. The arena compares the answers and the cost."
        >
          <ul className="dash-list">
            {arenas.map((run) => (
              <li key={`${run.threadId}-${run.at}`} className="dash-arena">
                <span className="dash-row-main">
                  <strong>{run.prompt.length > 60 ? `${run.prompt.slice(0, 59)}…` : run.prompt}</strong>
                  <em>{run.models.join(" · ")}</em>
                </span>
                <span className="dash-row-meta">
                  {formatUsd(run.costUsd)}
                  <small>{timeAgo(run.at)}</small>
                </span>
              </li>
            ))}
          </ul>
        </DashboardCard>

        <DashboardCard
          title="Streak"
          hint="Days with at least one answer. The count stays on this device (PR-05)."
          icon="spark"
          state="ready"
          empty={
            streak.current === 0
              ? "No streak yet. One answer today starts it. A missed day ends the run, and your best stays — no guilt."
              : ""
          }
        >
          <div className="dash-streak">
            <span className="dash-streak-number">{streak.current}</span>
            <span className="dash-streak-unit">
              {streak.current === 1 ? "day in a row" : "days in a row"}
            </span>
            <div className="dash-streak-meta">
              <span>Best {streak.best}</span>
              <span>
                {streak.totalDays} active {streak.totalDays === 1 ? "day" : "days"}
              </span>
              <span className={streak.activeToday ? "ws-good" : ""}>
                {streak.activeToday ? "today counts" : "no answer today yet"}
              </span>
            </div>
          </div>
        </DashboardCard>

        <DashboardCard
          title="Cost this week"
          hint="The last seven UTC days. Every cost is an estimate (CO-02)."
          icon="wallet"
          state={state}
          onRetry={load}
          empty=""
        >
          <div className="dash-cost">
            <strong className="dash-cost-total">{formatUsd(week.totalUsd)}</strong>
            <span className="dash-cost-note">estimated</span>
          </div>
          <ol className="dash-bars" aria-label="Cost by day">
            {week.days.map((day) => {
              const max = Math.max(...week.days.map((entry) => entry.usd), 0.0001);
              return (
                <li key={day.day}>
                  <span
                    className="dash-bar"
                    style={{ height: `${Math.max(4, Math.round((day.usd / max) * 100))}%` }}
                    title={`${day.day}: ${formatUsd(day.usd)}`}
                  />
                  <small>{day.day.slice(8)}</small>
                </li>
              );
            })}
          </ol>
        </DashboardCard>
      </div>
    </div>
  );
}
