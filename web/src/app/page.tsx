import {
  ArrowDown,
  ArrowRight,
  Briefcase,
  Coins,
  Eye,
  FileCode,
  FileText,
  Flask,
  Handshake,
  Hash,
  IdentificationBadge,
  Prohibit,
  Receipt,
  Scales,
  Signature,
  Storefront,
  Target,
} from "@phosphor-icons/react/dist/ssr";
import { Ledger } from "@/components/Ledger";
import { Replay, type ReplayStep } from "@/components/Replay";
import { CopyCommand } from "@/components/CopyCommand";
import { ExtLink } from "@/components/ExtLink";
import { loadDeployment, loadPayments, loadRuns } from "@/lib/data";
import { addressUrl, dollars, short, txUrl, usdc } from "@/lib/format";

const REPO = "https://github.com/kasbsquall/sealed-base";
const SOURCIFY = (chainId: number, address: string) => `https://repo.sourcify.dev/${chainId}/${address}`;

/** Mirrors scripts/verify-run.ts: four checks per commit, three for a settlement or one for an expiry, and one on the final contract state. */
const verifyChecks = (rounds: number, settled: boolean) => rounds * 2 * 4 + (settled ? 3 : 1) + 1;

/** The buyer's refusal reason from the transcript, in dollars when it is a price mismatch. */
const refusalText = (reason: string, agreed: string) => {
  const asked = /^asks (\d+) atomic USDC per call/.exec(reason)?.[1];
  return asked ? `Asked ${usdc(asked)} per call; the deal says ${usdc(agreed)}` : reason;
};

/** The Cruce mark: the buyer's line rises, the seller's falls, and the square is where they settle. */
function SealMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 64 64" aria-hidden="true">
      <line x1="8" y1="52" x2="56" y2="20" stroke="currentColor" strokeWidth="6.5" strokeLinecap="square" />
      <line x1="8" y1="16" x2="56" y2="44" stroke="currentColor" strokeWidth="6.5" strokeLinecap="square" />
      <rect x="31.3" y="27.3" width="11" height="11" fill="var(--paper)" />
      <rect x="32.8" y="28.8" width="8" height="8" fill="var(--accent)" />
    </svg>
  );
}

export default function Page() {
  const runs = loadRuns();
  const deployment = loadDeployment();
  const [deal, noDeal] = runs;
  const commits = runs.reduce((n, r) => n + r.rounds.length * 2, 0);
  const firstCommit = deal.rounds[0];
  const { policy } = deployment;
  const minAverage = (policy.minAverageValue / 10 ** policy.decimals).toFixed(policy.decimals);
  const newcomerReviews = deployment.feedback.newcomer.length;
  const command = runs.map((r) => `RUN=${r.file} npm run verify:run`).join("\n");
  const payments = loadPayments();
  const paidCalls = payments.calls.filter((c) => c.paid);
  const firstPayment = paidCalls[0];
  const refused = payments.calls.find((c) => c.refusal);
  const lastRound = deal.rounds[deal.rounds.length - 1];
  const replaySteps: ReplayStep[] = [
    {
      kind: "admit",
      title: "Both agents admitted",
      detail: `ERC-8004 agents #${deal.agents.buyer.agentId} and #${deal.agents.seller.agentId} clear the reputation gate, and negotiation #${deal.negotiationId} opens on Base Sepolia.`,
      links: [{ label: `Open ${short(deal.createTx)}`, href: txUrl(deal.createTx) }],
    },
    ...deal.rounds.map((r): ReplayStep => ({
      kind: r.crossed ? "cross" : "miss",
      title: r.crossed ? `Round ${r.round}: a deal is possible` : `Round ${r.round}: no deal yet`,
      detail: r.crossed
        ? "Both agents lock a sealed offer on Base. The referee says the buyer now offers at least what the seller asks."
        : "Both agents lock a sealed offer on Base. The referee says the offers do not meet, and neither agent learns the other's number.",
      links: [
        { label: `Buyer ${short(r.buyer.commitTx)}`, href: txUrl(r.buyer.commitTx) },
        { label: `Seller ${short(r.seller.commitTx)}`, href: txUrl(r.seller.commitTx) },
      ],
    })),
    {
      kind: "settle",
      title: `Settled at ${dollars(deal.settledPrice!)} per 1,000 calls`,
      detail: `One transaction opens both final offers, ${dollars(lastRound.buyer.offer)} and ${dollars(lastRound.seller.offer)}, and settles halfway. These are the first offers anyone outside the referee can read.`,
      links: [{ label: `Settle ${short(deal.settleTx!)}`, href: txUrl(deal.settleTx!) }],
    },
    {
      kind: "pay",
      title: `Paid ${paidCalls.length} calls at ${usdc(payments.usdcPerCall)} in USDC`,
      detail: "The buyer pays the seller's API per call over x402, at the settled price read from the contract.",
      links: paidCalls.map((c, i) => ({ label: `Payment ${i + 1}`, href: txUrl(c.transaction!) })),
    },
    ...(refused
      ? [
          {
            kind: "refuse" as const,
            title: `Refused a call at ${refusalText(refused.refusal!, payments.usdcPerCall).match(/\$[0-9.]+/)?.[0] ?? "another price"}`,
            detail: "The seller asked for more than the deal. The buyer refused before signing anything, so no money moved.",
            links: [],
          },
        ]
      : []),
  ];

  return (
    <>
      <header className="wrap masthead rise">
        <span className="wordmark">
          <SealMark />
          Sealed
        </span>
        <span className="eyebrow">Colosseum Crypto World&apos;s Fair · Base track</span>
      </header>

      <main>
        <section className="wrap hero" aria-labelledby="title">
          <div className="eyebrow rise" style={{ ["--b" as string]: 1 }}>
            If the seller sees your maximum, it charges your maximum
          </div>
          <h1 id="title" className="rise" style={{ ["--b" as string]: 1 }}>
            Your agent can haggle <em>without showing its budget first.</em>
          </h1>
          <p className="lede rise" style={{ ["--b" as string]: 2 }}>
            Each agent locks its offer on Base in sealed form. A referee service, which does see both offers, tells the
            agents only whether a deal is possible. When it is, one transaction settles halfway between the two final
            offers, and the buyer pays that price per call in USDC over x402. When it never is, no offer is ever made
            public. Below are two real negotiations between AI agents on Base Sepolia, a test network, and the payment
            that followed.
          </p>
          <div className="hero-actions rise" style={{ ["--b" as string]: 3 }}>
            <a className="action primary" href="#replay-title">
              <ArrowDown size={16} weight="light" aria-hidden /> Watch the deal replay
            </a>
            <a className="action" href="#verify-title">
              Check it yourself
            </a>
          </div>

          <dl className="register rise" style={{ ["--b" as string]: 3 }}>
            <div>
              <dt className="eyebrow">
                <Handshake size={14} weight="light" aria-hidden /> Negotiations
              </dt>
              <dd>
                <span className="figure">{runs.length}</span>
                <span className="note">shown here, both run on Base Sepolia: one deal, one expiry</span>
              </dd>
            </div>
            <div>
              <dt className="eyebrow">
                <Hash size={14} weight="light" aria-hidden /> Sealed offers
              </dt>
              <dd>
                <span className="figure">{commits}</span>
                <span className="note">recorded on Base, none of them readable</span>
              </dd>
            </div>
            <div>
              <dt className="eyebrow">
                <IdentificationBadge size={14} weight="light" aria-hidden /> Agents
              </dt>
              <dd>
                <span className="figure">
                  #{deployment.agents.buyer.agentId} · #{deployment.agents.seller.agentId}
                </span>
                <span className="note">ERC-8004 identities, admitted by on-chain reviews our seed script wrote</span>
              </dd>
            </div>
            <div>
              <dt className="eyebrow">
                <FileCode size={14} weight="light" aria-hidden /> Contracts
              </dt>
              <dd>
                <span className="figure">2</span>
                <span className="note">source verified on Sourcify, exact match</span>
              </dd>
            </div>
          </dl>
        </section>

        <section className="wrap section" aria-labelledby="replay-title">
          <div className="section-head">
            <div>
              <div className="eyebrow">Replay</div>
              <h2 id="replay-title">Negotiation #{deal.negotiationId}, from first offer to payment</h2>
            </div>
            <p>
              Every step below happened on Base Sepolia. Each one links to its transaction, so you can open the record
              behind it.
            </p>
          </div>
          <Replay steps={replaySteps} />
        </section>

        <section className="wrap section" aria-labelledby="ledger-title">
          <div className="section-head rise" style={{ ["--b" as string]: 4 }}>
            <div>
              <div className="eyebrow">The record</div>
              <h2 id="ledger-title">Two negotiations, round by round</h2>
            </div>
            <p>
              The same rounds, seen two ways. Toggle between what each agent knew and what Base recorded for the same
              moves.
            </p>
          </div>
          <div className="rise" style={{ ["--b" as string]: 5 }}>
            <Ledger runs={runs} />
          </div>
        </section>

        <section className="wrap section" aria-labelledby="pay-title">
          <div className="section-head">
            <div>
              <div className="eyebrow">Payment</div>
              <h2 id="pay-title">Then the buyer paid the price it agreed to</h2>
            </div>
            <p>
              Negotiation #{payments.negotiationId} settled at {dollars(payments.settledPrice)} per 1,000 calls. The buyer
              agent then paid the seller&apos;s API per call over x402, in USDC on Base Sepolia. Before signing, it checks the
              price and the payee against the settled deal on-chain, and refuses anything else.
            </p>
          </div>
          <div className="payments">
            <div className="pay-figure">
              <div className="eyebrow">
                <Coins size={14} weight="light" aria-hidden /> Paid per call
              </div>
              <p className="figure">{usdc(payments.usdcPerCall)}</p>
              <div className="outcome-unit">
                USDC, read from negotiation #{payments.negotiationId}: {dollars(payments.settledPrice)} per 1,000 calls
              </div>
              <dl className="pay-balance">
                <dt className="eyebrow">Seller&apos;s USDC balance</dt>
                <dd>
                  {usdc(payments.sellerUsdcBefore)} <ArrowRight size={12} weight="light" aria-label="to" />{" "}
                  {usdc(payments.sellerUsdcAfter)}
                  <span className="note">
                    {" "}
                    after {paidCalls.length} paid {paidCalls.length === 1 ? "call" : "calls"}
                  </span>
                </dd>
              </dl>
            </div>
            <ol className="pay-calls">
              {payments.calls.map((c, i) => (
                <li key={i} className={c.paid ? undefined : "refused"} style={{ ["--i" as string]: Math.min(i, 7) }}>
                  <span className="n">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <span className="endpoint">GET {new URL(c.url).pathname}</span>
                    {c.paid ? (
                      <span className="pay-state">
                        <Receipt size={16} weight="light" aria-hidden /> Paid {usdc(payments.usdcPerCall)}
                      </span>
                    ) : (
                      <span className="pay-state">
                        <Prohibit size={16} weight="light" aria-hidden /> Refused before signing
                      </span>
                    )}
                    {c.refusal && <span className="reason">{refusalText(c.refusal, payments.usdcPerCall)}</span>}
                  </div>
                  <div className="pay-tx">
                    {c.transaction ? (
                      <ExtLink href={txUrl(c.transaction)}>{short(c.transaction)}</ExtLink>
                    ) : (
                      <span className="none">No transaction</span>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="wrap section" aria-labelledby="how-title">
          <div className="section-head">
            <div>
              <div className="eyebrow">Mechanism</div>
              <h2 id="how-title">How a sealed negotiation runs</h2>
            </div>
            <p>Two contracts on Base, and one off-chain relay that sees both offers and tells the agents only yes or no.</p>
          </div>
          <ol className="process">
            <li>
              <div className="step">
                <span className="eyebrow">01</span>
                <IdentificationBadge size={22} weight="light" aria-hidden />
              </div>
              <h3>Admit</h3>
              <p>
                The gate reads the ERC-8004 registries. An agent may negotiate only with at least{" "}
                {policy.minFeedbackCount} reviews from {policy.reviewers.length} approved reviewer addresses, with an
                average score of at least {minAverage}.
              </p>
              <span className="where">ReputationGate.sol</span>
            </li>
            <li>
              <div className="step">
                <span className="eyebrow">02</span>
                <Hash size={22} weight="light" aria-hidden />
              </div>
              <h3>Commit</h3>
              <p>
                Each round, both agents send Base a hash of their offer plus a random 32-byte secret, the salt, so nobody
                can find the price by hashing likely numbers. The offer itself stays with the agent.
              </p>
              <span className="where">SealedNegotiation.commitOffer</span>
            </li>
            <li>
              <div className="step">
                <span className="eyebrow">03</span>
                <Scales size={22} weight="light" aria-hidden />
              </div>
              <h3>Clear</h3>
              <p>
                The relay checks each agent&apos;s offer and salt against its hash on-chain and tells both sides one bit: crossed,
                or not.
              </p>
              <span className="where">agents/relay/clearingRelay.ts</span>
            </li>
            <li>
              <div className="step">
                <span className="eyebrow">04</span>
                <Signature size={22} weight="light" aria-hidden />
              </div>
              <h3>Settle</h3>
              <p>
                When the numbers cross, both agents sign over the exact pair of hashes, and one transaction settles at the
                midpoint. There is no separate reveal step to back out of.
              </p>
              <span className="where">SealedNegotiation.settle</span>
            </li>
          </ol>
        </section>

        <section className="wrap section" aria-labelledby="verify-title">
          <div className="section-head">
            <div>
              <div className="eyebrow">Verification</div>
              <h2 id="verify-title">Check it yourself</h2>
            </div>
            <p>Every link opens Base Sepolia on Basescan or Sourcify, and the script reads the chain itself. You need no wallet.</p>
          </div>
          <ol className="checks">
            <li>
              <span className="n">01</span>
              <div>
                <h3>Open a commit transaction</h3>
                <p>
                  Its input is <span className="mono">commitOffer(negotiationId, hash)</span>. Decode it on Basescan:
                  32 bytes of hash, and no price.
                </p>
              </div>
              <div className="check-body">
                <ExtLink href={txUrl(firstCommit.buyer.commitTx)}>Buyer, round 1: {short(firstCommit.buyer.commitTx)}</ExtLink>
                <ExtLink href={txUrl(firstCommit.seller.commitTx)}>Seller, round 1: {short(firstCommit.seller.commitTx)}</ExtLink>
              </div>
            </li>
            <li>
              <span className="n">02</span>
              <div>
                <h3>Recompute every hash from the transcripts</h3>
                <p>
                  The script rebuilds each hash from the published offer and salt and compares it with the calldata on
                  Base Sepolia: {verifyChecks(deal.rounds.length, true)} checks for #{deal.negotiationId},{" "}
                  {verifyChecks(noDeal.rounds.length, false)} for #{noDeal.negotiationId}. Run it in bash or zsh
                  from the repository root after <span className="mono">npm install</span>.
                </p>
              </div>
              <div className="check-body">
                <CopyCommand command={command} />
              </div>
            </li>
            <li>
              <span className="n">03</span>
              <div>
                <h3>Read the contracts</h3>
                <p>Both are verified on Sourcify with an exact match to the source in the repository.</p>
              </div>
              <div className="check-body">
                <ExtLink href={SOURCIFY(deployment.chainId, deployment.contracts.SealedNegotiation)}>SealedNegotiation {short(deployment.contracts.SealedNegotiation)}</ExtLink>
                <ExtLink href={SOURCIFY(deployment.chainId, deployment.contracts.ReputationGate)}>ReputationGate {short(deployment.contracts.ReputationGate)}</ExtLink>
              </div>
            </li>
            <li>
              <span className="n">04</span>
              <div>
                <h3>Check who may negotiate</h3>
                <p>
                  The gate reads the canonical ERC-8004 registries. A third agent, #{deployment.agents.newcomer.agentId},
                  has {newcomerReviews} {newcomerReviews === 1 ? "review" : "reviews"}, below the minimum of{" "}
                  {policy.minFeedbackCount}, and the gate refused it in our smoke test.
                </p>
              </div>
              <div className="check-body">
                <ExtLink href={addressUrl(deployment.registries.identity)}>Identity Registry {short(deployment.registries.identity)}</ExtLink>
                <ExtLink href={addressUrl(deployment.registries.reputation)}>Reputation Registry {short(deployment.registries.reputation)}</ExtLink>
              </div>
            </li>
            <li>
              <span className="n">05</span>
              <div>
                <h3>Check the payments</h3>
                <p>
                  The script reads the price and both wallets from the contract, confirms each USDC transfer on Base
                  Sepolia, and checks that no other payment from the buyer to the seller happened during the run.
                </p>
              </div>
              <div className="check-body">
                <ExtLink href={txUrl(firstPayment.transaction!)}>Payment 1: {short(firstPayment.transaction!)}</ExtLink>
                <CopyCommand command={`npm run verify:payments -- ${payments.file}`} />
              </div>
            </li>
          </ol>
        </section>

        <section className="wrap section" aria-labelledby="business-title">
          <div className="section-head">
            <div>
              <div className="eyebrow">Business</div>
              <h2 id="business-title">Who pays for Sealed</h2>
            </div>
            <p>The plan after the event. None of this is charged in the demo.</p>
          </div>
          <div className="business">
            <div className="business-figure">
              <span className="figure">0.25%</span>
              <span className="note">of the value paid at a price settled through Sealed, charged to the seller</span>
            </div>
            <ul className="limits">
              <li>
                <Storefront size={22} weight="light" className="icon" />
                <div>
                  <h3>First customers</h3>
                  <p>
                    API sellers that already charge per call over x402. Sealed lets them sell volume to buying agents at a
                    negotiated price without publishing a price list the other side can game.
                  </p>
                </div>
              </li>
              <li>
                <Target size={22} weight="light" className="icon" />
                <div>
                  <h3>Why they pay</h3>
                  <p>
                    A buyer agent that cannot be squeezed is willing to commit to volume. At 1,000,000 calls a month at the
                    demo&apos;s $0.042, the seller earns $42,000 and Sealed $105.
                  </p>
                </div>
              </li>
              <li>
                <Briefcase size={22} weight="light" className="icon" />
                <div>
                  <h3>Next, in order</h3>
                  <p>
                    Move the referee into an attested enclave, code the fee into settlement, deploy on Base mainnet, and
                    run a pilot with one x402 seller.
                  </p>
                </div>
              </li>
              <li>
                <IdentificationBadge size={22} weight="light" className="icon" />
                <div>
                  <h3>Team</h3>
                  <p>The founder will build Sealed full-time after the event.</p>
                </div>
              </li>
            </ul>
          </div>
        </section>

        <section className="wrap section" aria-labelledby="limits-title">
          <div className="section-head">
            <div>
              <div className="eyebrow">Limits</div>
              <h2 id="limits-title">What this demo does not claim</h2>
            </div>
            <p>Four limits of this demo.</p>
          </div>
          <ul className="limits">
            <li>
              <Eye size={22} weight="light" className="icon" />
              <div>
                <h3>The relay is trusted with privacy</h3>
                <p>
                  It sees both offers each round. It cannot forge or alter a deal, because settlement needs both agents&apos;
                  signatures over the exact pair of hashes. The demo relay runs on our own machine; the production path
                  is an attested TEE or threshold encryption.
                </p>
              </div>
            </li>
            <li>
              <Coins size={22} weight="light" className="icon" />
              <div>
                <h3>Testnet money, demo data</h3>
                <p>
                  The payments move testnet USDC on Base Sepolia. The API the buyer pays for returns a labelled demo
                  payload.
                </p>
              </div>
            </li>
            <li>
              <Flask size={22} weight="light" className="icon" />
              <div>
                <h3>The reputation is seeded</h3>
                <p>
                  The reviews that admit agents #{deployment.agents.buyer.agentId} and #{deployment.agents.seller.agentId}{" "}
                  were written by our own seed script, and the repository labels them that way.
                </p>
              </div>
            </li>
            <li>
              <FileText size={22} weight="light" className="icon" />
              <div>
                <h3>The transcripts publish secrets on purpose</h3>
                <p>Price limits, offers and salts are published so you can recompute every hash. A real agent keeps them private.</p>
              </div>
            </li>
          </ul>
        </section>
      </main>

      <footer className="wrap footer">
        <dl className="num">
          <dt>Network</dt>
          <dd className="mono">Base Sepolia · {deployment.chainId}</dd>
          <dt>SealedNegotiation</dt>
          <dd>
            <ExtLink href={addressUrl(deployment.contracts.SealedNegotiation)}>{short(deployment.contracts.SealedNegotiation)}</ExtLink>
          </dd>
          <dt>ReputationGate</dt>
          <dd>
            <ExtLink href={addressUrl(deployment.contracts.ReputationGate)}>{short(deployment.contracts.ReputationGate)}</ExtLink>
          </dd>
          <dt>Source</dt>
          <dd>
            <ExtLink href={REPO}>kasbsquall/sealed-base</ExtLink>
          </dd>
        </dl>
        <span>Built for Colosseum Crypto World&apos;s Fair, Base track.</span>
      </footer>
    </>
  );
}
