/**
 * PV-02: the one place that resolves the fetch function.
 *
 * A browser calls `fetch` with the wrong receiver and throws "Illegal
 * invocation" when the function is stored on an object and called as a method,
 * or when it is passed on detached. Every call site asks for the function here,
 * so the binding cannot break again in one place only.
 */
export function bindFetch(impl?: typeof fetch): typeof fetch {
  return impl ?? ((input, init) => fetch(input, init));
}
