import {
  Coins,
  Eye,
  FileCode,
  FileText,
  Flask,
  Handshake,
  Hash,
  IdentificationBadge,
  Scales,
  Signature,
} from "@phosphor-icons/react/dist/ssr";
import { Ledger } from "@/components/Ledger";
import { CopyCommand } from "@/components/CopyCommand";
import { ExtLink } from "@/components/ExtLink";
import { loadDeployment, loadRuns } from "@/lib/data";
import { addressUrl, short, txUrl } from "@/lib/format";

const SOURCIFY = (chainId: number, address: string) => `https://repo.sourcify.dev/${chainId}/${address}`;

/** Mirrors scripts/verify-run.ts: four checks per commit, three for a settlement or one for an expiry, and one on the final contract state. */
const verifyChecks = (rounds: number, settled: boolean) => rounds * 2 * 4 + (settled ? 3 : 1) + 1;

function SealMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <rect x="3.5" y="8.6" width="13" height="2.8" fill="currentColor" />
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
            Sealed-bid price negotiation on Base
          </div>
          <h1 id="title" className="rise" style={{ ["--b" as string]: 1 }}>
            Two AI agents agreed on a price. <em>Neither saw the other&apos;s number first.</em>
          </h1>
          <p className="lede rise" style={{ ["--b" as string]: 2 }}>
            Each agent commits its offer to Base as a hash. An off-chain relay tells both sides only whether the offers
            crossed, meaning the buyer offered at least what the seller asked. If they cross, one transaction settles
            halfway between the two and makes that final pair public. If they never cross, no offer is ever made public.
          </p>

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
                <Hash size={14} weight="light" aria-hidden /> Commit transactions
              </dt>
              <dd>
                <span className="figure">{commits}</span>
                <span className="note">each holds only a hash, no offer</span>
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
          </ol>
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
                <h3>Testnet, and no payment</h3>
                <p>Settlement records the agreed price on Base Sepolia. Moving funds is outside this version.</p>
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
        </dl>
        <span>Built for Colosseum Crypto World&apos;s Fair, Base track.</span>
      </footer>
    </>
  );
}
