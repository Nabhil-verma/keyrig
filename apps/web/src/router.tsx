import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from "react";

/** The pages of the web app. Any other path shows the not-found page. */
export type Route = "/" | "/providers" | "/security" | "/app" | "not-found";

const KNOWN_PATHS: readonly string[] = ["/", "/providers", "/security", "/app"];
const NAVIGATE_EVENT = "keyrig:navigate";

function readPath(): string {
  const path = window.location.pathname.replace(/\/+$/, "");
  return path.length === 0 ? "/" : path;
}

export function resolveRoute(path: string): Route {
  return KNOWN_PATHS.includes(path) ? (path as Route) : "not-found";
}

/** Returns the current page and updates when the history changes. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => resolveRoute(readPath()));

  useEffect(() => {
    const sync = (): void => setRoute(resolveRoute(readPath()));
    window.addEventListener("popstate", sync);
    window.addEventListener(NAVIGATE_EVENT, sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener(NAVIGATE_EVENT, sync);
    };
  }, []);

  return route;
}

export function navigate(to: Route): void {
  if (readPath() !== to) {
    window.history.pushState(null, "", to);
  }
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
  window.scrollTo(0, 0);
}

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  to: Route;
}

/** A link that changes the page without a reload. Modified clicks keep the browser default. */
export function Link({ to, onClick, ...rest }: LinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>): void => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    navigate(to);
  };
  return <a href={to} {...rest} onClick={handleClick} />;
}
