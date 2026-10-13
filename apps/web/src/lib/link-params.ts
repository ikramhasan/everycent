import { useEffect, useState } from "react";

/**
 * Emailed links carry their token in the URL fragment (`/verify-email#token=…`): fragments never
 * reach a server, so the token stays out of logs and Referer headers.
 */
export function readLinkParams(hash = window.location.hash): {
  token: string | null;
  step: string | null;
} {
  const params = new URLSearchParams(hash.slice(1));
  return { token: params.get("token"), step: params.get("step") };
}

/**
 * The link's token and step. The fragment is then removed from the address bar and history so the
 * token isn't left on screen. Another link opened in the same tab only changes the fragment (no
 * page load), so the params follow `hashchange` too.
 */
export function useLinkParams() {
  // `opened` counts links opened in this tab: key a page's state on it so reopening even the same
  // link starts over rather than showing the last attempt's result.
  const [params, setParams] = useState(() => ({ ...readLinkParams(), opened: 0 }));
  useEffect(() => {
    function take() {
      if (!window.location.hash) return;
      const next = readLinkParams();
      setParams((prev) => ({ ...next, opened: prev.opened + 1 }));
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname + window.location.search,
      );
    }
    take();
    window.addEventListener("hashchange", take);
    return () => window.removeEventListener("hashchange", take);
  }, []);
  return params;
}
