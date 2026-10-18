/**
 * Sets the browser tab title to "everycent | <name>". React hoists the `<title>` into the
 * document head ahead of index.html's static "everycent", so the page that renders last wins and
 * the static title stays as the fallback. Render it from page components only, not layouts.
 */
export function PageTitle({ name }: { name: string }) {
  return <title>{`everycent | ${name}`}</title>;
}
