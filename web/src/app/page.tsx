import { GithubLogo } from "@phosphor-icons/react/dist/ssr";
import { ExtLink } from "@/components/ExtLink";
import { SealMark } from "@/components/SealMark";
import { Record } from "@/components/record/Record";
import { OrderLog, type StripField } from "@/components/replay/OrderLog";
import { ReplayProvider } from "@/components/replay/ReplayProvider";
import { TriplicateSet } from "@/components/replay/TriplicateSet";
import { Payment } from "@/components/sections/Payment";
import { Practice } from "@/components/sections/Practice";
import { Business, Limits, Mechanism, Verify } from "@/components/sections/Fine";
import { loadDeployment, loadPayments, loadRuns, loadSeparated } from "@/lib/data";
import { addressUrl, short } from "@/lib/format";
import { orderView } from "@/lib/view";

const REPO = "https://github.com/kasbsquall/sealed-base";
const REPO_NAME = "kasbsquall/sealed-base";

const NAV = [
  { href: "#payment", label: "Payment", always: false },
  { href: "#replay", label: "Order log", always: false },
  { href: "#verify", label: "Check it yourself", always: true },
  { href: "#record", label: "The record", always: false },
  { href: "#practice", label: "Try it", always: false },
  { href: "#mechanism", label: "How it runs", always: false },
  { href: "#limits", label: "Limits", always: false },
];

function SectionHead({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <header className="sec-head">
      <h2 id={id}>{title}</h2>
      <p>{children}</p>
    </header>
  );
}

export default function Page() {
  const runs = loadRuns();
  const deployment = loadDeployment();
  const payments = loadPayments();
  const [deal] = runs;
  const order = orderView(deal, payments, {
    buyer: deployment.admission.buyer.clears,
    seller: deployment.admission.seller.clears,
  });
  const commits = runs.reduce((n, r) => n + r.rounds.length * 2, 0);
  const opened = runs.filter((r) => r.outcome === "settled");
  const ids = runs.map((r) => `#${r.negotiationId}`);
  const contracts = Object.keys(deployment.contracts).length;
  const strip: StripField[] = [
    { label: "Negotiations", figure: String(runs.length), note: "shown here, both ran on Base Sepolia: one deal, one expiry" },
    {
      label: "Sealed offers",
      figure: String(commits),
      note: `hashes on Base; only ${opened.map((r) => `#${r.negotiationId}`).join(" and ")}'s ${opened.length * 2} final offers were ever opened`,
    },
    {
      label: "Agents",
      figure: `#${deployment.agents.buyer.agentId}, #${deployment.agents.seller.agentId}`,
      note: "each has an ERC-8004 ID and track record on Base; we wrote these demo records ourselves",
    },
    { label: "Contracts", figure: String(contracts), note: "source verified on Sourcify, exact match" },
  ];

  return (
    <>
      <a className="skip" href="#order">
        Skip to the order
      </a>
      <nav className="desk-nav" aria-label="Main">
        <a className="brand" href="#top">
          <SealMark ground="var(--desk)" />
          Sealed
        </a>
        <ul>
          {NAV.map((n) => (
            <li key={n.href} className={n.always ? undefined : "opt"}>
              <a className="nl" href={n.href}>
                {n.label}
              </a>
            </li>
          ))}
          <li>
            <a className="nl" href={REPO} target="_blank" rel="noreferrer">
              <GithubLogo size="1.1em" weight="light" aria-hidden />
              <span className="nl-label">Repository</span>
              <span className="sr"> (opens in a new tab)</span>
            </a>
          </li>
        </ul>
      </nav>

      <main id="top">
        <ReplayProvider steps={order.steps.map(({ n, slot, title }) => ({ n, slot, title }))}>
          <section className="hero" id="order" tabIndex={-1} aria-label={`Negotiation order No. ${order.id}`}>
            <TriplicateSet order={order} />
          </section>

          <section className="sec" id="payment" aria-labelledby="payment-h">
            <SectionHead id="payment-h" title="Then the buyer paid the price it agreed to">
              Per call over x402, in USDC from its owner&apos;s Base Account. Before signing, the buyer checks price and
              payee against deal #{payments.negotiationId}.
            </SectionHead>
            <Payment payments={payments} />
          </section>

          <section className="sec" id="replay" aria-labelledby="replay-h">
            <SectionHead id="replay-h" title={`Negotiation #${order.id}, step by step`}>
              Every step happened on Base Sepolia, and each links to its transaction.
            </SectionHead>
            <OrderLog id={order.id} steps={order.steps} strip={strip} />
          </section>
        </ReplayProvider>

        <section className="sec" id="verify" aria-labelledby="verify-h">
          <SectionHead id="verify-h" title="Check it yourself">
            Every link opens Base Sepolia on Basescan or Sourcify, and the two scripts read the chain itself. You need
            no wallet.
          </SectionHead>
          <Verify runs={runs} deployment={deployment} payments={payments} />
        </section>

        <section className="sec" id="record" aria-labelledby="record-h">
          <SectionHead id="record-h" title="Two negotiations, round by round">
            Negotiations {ids.join(" and ")}. Switch between what each agent knew and what Base recorded.
          </SectionHead>
          <Record runs={runs} />
        </section>

        <section className="sec" id="practice" aria-labelledby="practice-h">
          <SectionHead id="practice-h" title="Try a negotiation yourself">
            Pick both private limits. Your browser seals every offer with the same hash the deployed contract checks, and
            you see only what the referee would tell the agents. Nothing leaves this page.
          </SectionHead>
          <Practice
            chainId={deployment.chainId}
            contract={deployment.contracts.SealedNegotiation}
            buyerWallet={deployment.agents.buyer.wallet}
            sellerWallet={deployment.agents.seller.wallet}
          />
        </section>

        <section className="sec" id="mechanism" aria-labelledby="mech-h">
          <SectionHead id="mech-h" title="How a sealed negotiation runs">
            Two contracts on Base, and one off-chain referee that sees both offers and tells the agents only yes or no.
          </SectionHead>
          <Mechanism deployment={deployment} />
        </section>

        <section className="sec" id="business" aria-labelledby="biz-h">
          <SectionHead id="biz-h" title="Who pays for Sealed">
            The plan after the event. None of this is charged in the demo.
          </SectionHead>
          <Business deal={deal} payments={payments} />
        </section>

        <section className="sec" id="limits" aria-labelledby="limits-h">
          <SectionHead id="limits-h" title="What this demo does not claim">
            Four limits of this demo.
          </SectionHead>
          <Limits deployment={deployment} separated={loadSeparated()} />
        </section>
      </main>

      <footer className="foot">
        <a className="brand" href="#top">
          <SealMark ground="var(--desk)" />
          Sealed<span className="sr">, back to top</span>
        </a>
        <div className="lks">
          <ExtLink href={REPO}>{REPO_NAME}</ExtLink>
          <ExtLink href={addressUrl(deployment.contracts.SealedNegotiation)}>
            SealedNegotiation {short(deployment.contracts.SealedNegotiation)}
          </ExtLink>
          <ExtLink href={addressUrl(deployment.contracts.ReputationGate)}>
            ReputationGate {short(deployment.contracts.ReputationGate)}
          </ExtLink>
        </div>
        <p>
          Base Sepolia, chain {deployment.chainId}, a test network. Built for Colosseum Crypto World&apos;s Fair, Base
          track.
        </p>
      </footer>
    </>
  );
}
