import { ArrowSquareOut } from "@phosphor-icons/react/dist/ssr";

/** A link to Basescan or Sourcify: accent colour, external icon, and a spoken hint that it opens a new tab. */
export function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a className="chain-link" href={href} target="_blank" rel="noreferrer">
      {children}
      <ArrowSquareOut size={14} weight="light" aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}
