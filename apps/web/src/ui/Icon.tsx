import type { SVGProps } from "react";

export type IconName =
  | "chat"
  | "arena"
  | "key"
  | "shield"
  | "lock"
  | "unlock"
  | "send"
  | "stop"
  | "trash"
  | "refresh"
  | "plus"
  | "chevron"
  | "sun"
  | "moon"
  | "alert"
  | "check"
  | "offline"
  | "cpu"
  | "wallet"
  | "link"
  | "spark"
  | "arrow"
  | "route"
  | "bolt"
  | "eyeOff"
  | "globe"
  | "download";

const PATHS: Record<IconName, React.ReactNode> = {
  chat: <path d="M4 5.5h16v10.5H9l-5 4V5.5Z" />,
  arena: (
    <>
      <rect x="3.5" y="4.5" width="7" height="15" rx="1.5" />
      <rect x="13.5" y="4.5" width="7" height="9.5" rx="1.5" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="8" r="4" />
      <path d="M11 11l8.5 8.5M16 16l2-2M18.5 18.5l2-2" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.5 19 6v5.5c0 4-3 7.2-7 9-4-1.8-7-5-7-9V6l7-2.5Z" />
      <path d="M9 12l2.2 2.2L15.5 10" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
  unlock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 6.7-1.4" />
    </>
  ),
  send: <path d="M4 12 20 4l-6.5 16-2.6-6.2L4 12Z" />,
  stop: <rect x="7" y="7" width="10" height="10" rx="1.5" />,
  trash: (
    <>
      <path d="M5 7h14M9 7V5.5h6V7M7 7l1 13h8l1-13" />
      <path d="M10.5 11v5M13.5 11v5" />
    </>
  ),
  refresh: (
    <>
      <path d="M19 12a7 7 0 0 1-12 5M5 12a7 7 0 0 1 12-5" />
      <path d="M17 4v4h-4M7 20v-4h4" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  chevron: <path d="M6 9l6 6 6-6" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" />,
  alert: (
    <>
      <path d="M12 4 21 20H3L12 4Z" />
      <path d="M12 10v4.5M12 17.2v.3" />
    </>
  ),
  check: <path d="M4.5 12.5 9.5 17.5 20 6.5" />,
  offline: (
    <>
      <path d="M5 4l14 16" />
      <rect x="4" y="6" width="16" height="5" rx="1.5" />
      <rect x="4" y="14" width="16" height="5" rx="1.5" />
    </>
  ),
  cpu: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M10 10h4v4h-4zM9 2.5v3M15 2.5v3M9 18.5v3M15 18.5v3M2.5 9h3M2.5 15h3M18.5 9h3M18.5 15h3" />
    </>
  ),
  wallet: (
    <>
      <rect x="3.5" y="6" width="17" height="13" rx="2.5" />
      <path d="M3.5 9.5h17M16 14.5h2" />
    </>
  ),
  link: (
    <>
      <path d="M10 14 14 10" />
      <path d="M8.5 16.5 7 18a3.5 3.5 0 0 1-5-5l2.5-2.5a3.5 3.5 0 0 1 5 0" />
      <path d="M15.5 7.5 17 6a3.5 3.5 0 0 1 5 5l-2.5 2.5a3.5 3.5 0 0 1-5 0" />
    </>
  ),
  spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  route: (
    <>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="7" r="2.5" />
      <circle cx="12" cy="18" r="2.5" />
      <path d="M8.3 7.2c3 .6 4.2 2.4 5.2 6.2M15.6 9.2c-.8 3-1.8 5-2.6 6.4" />
    </>
  ),
  bolt: <path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z" />,
  eyeOff: (
    <>
      <path d="M3 3l18 18" />
      <path d="M10.6 5.2A9.6 9.6 0 0 1 12 5c5 0 8.5 4.5 9.5 7a10.6 10.6 0 0 1-2.4 3.6M6.4 6.6C4 8.2 2.6 10.4 2.5 12c1 2.5 4.5 7 9.5 7 1.6 0 3-.4 4.3-1" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.5 2.6 3.7 5.4 3.7 8.5s-1.2 5.9-3.7 8.5c-2.5-2.6-3.7-5.4-3.7-8.5s1.2-5.9 3.7-8.5Z" />
    </>
  ),
  download: <path d="M12 4v11M7.5 11.5 12 16l4.5-4.5M5 19.5h14" />,
};

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 18, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
