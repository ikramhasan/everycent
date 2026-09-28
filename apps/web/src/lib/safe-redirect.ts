/** Only allow same-origin absolute paths as post-login redirect targets. */
export function safeRedirect(target: unknown): string {
  if (typeof target !== "string" || !target.startsWith("/")) return "/";
  try {
    const decoded = decodeURIComponent(target);
    if (decoded.startsWith("//") || decoded.startsWith("/\\")) return "/";
  } catch {
    return "/";
  }
  const url = new URL(target, "http://same-origin.invalid");
  if (url.origin !== "http://same-origin.invalid") return "/";
  return `${url.pathname}${url.search}${url.hash}`;
}
