import {
  ArrowUUpLeft,
  ArrowsInLineHorizontal,
  Coins,
  Eye,
  FileCode,
  Flask,
  Hash,
  IdentificationBadge,
  Key,
  ListNumbers,
  Percent,
  Receipt,
  Scroll,
  Scales,
  Signature,
  Stamp,
  Storefront,
  TerminalWindow,
  UserList,
  UsersThree,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import type { Deployment, Payments, Run } from "@/lib/data";
import { addressUrl, dollars, pad2, short, txUrl, usdc } from "@/lib/format";
import { CopyCommand } from "../CopyCommand";
import { ExtLink } from "../ExtLink";

const SOURCIFY = (chainId: number, address: string) => `https://repo.sourcify.dev/${chainId}/${address}`;

/** Mirrors scripts/verify-run.ts: four checks per commit, three for a settlement or one for an expiry, and one on the final contract state. */
const verifyChecks = (rounds: number, settled: boolean) => rounds * 2 * 4 + (settled ? 3 : 1) + 1;

/** The planned fee, in basis points of the value paid at a settled price, and the volume used to illustrate it. */
const FEE_BPS = 25n;
const EXAMPLE_CALLS = 1_000_000n;

const money = (atomicUsdc: bigint) => `$${(atomicUsdc / 1_000_000n).toLocaleString("en-US")}`;

export function Mechanism({ deployment }: { deployment: Deployment }) {
  const { policy } = deployment;
  const minAverage = (policy.minAverageValue / 10 ** policy.decimals).toFixed(policy.decimals);
  const rows: { icon: Icon; title: string; text: string; where: string; sees: string; sealed?: boolean }[] = [
    {
      icon: IdentificationBadge,
      title: "Admit",
      text: `The gate reads the ERC-8004 registries. An agent may negotiate only with at least ${policy.minFeedbackCount} reviews from any of ${policy.reviewers.length} approved reviewers, with an average score of at least ${minAverage}.`,
      where: "ReputationGate.sol",
      sees: "The negotiation opening, once both agents clear the gate",
    },
    {
      icon: Hash,
      title: "Commit",
      text: "Each round, both agents send Base a hash of their offer plus a random 32-byte secret, the salt, so nobody can find the price by hashing likely numbers.",
      where: "SealedNegotiation.commitOffer",
      sees: "One 32-byte hash per offer, never the price",
      sealed: true,
    },
    {
      icon: ArrowsInLineHorizontal,
      title: "Clear",
      text: "The referee (clearingRelay.ts) checks each agent's offer and salt against its hash on-chain and tells both sides one bit: the offers meet, or not.",
      where: "agents/relay/clearingRelay.ts",
      sees: "Nothing: the referee answers off-chain",
    },
    {
      icon: Stamp,
      title: "Settle",
      text: "When the offers meet, both agents sign over the exact pair of hashes, and one transaction settles at the midpoint. There is no separate reveal step to back out of.",
      where: "SealedNegotiation.settle",
      sees: "Both final offers and the midpoint price, in one transaction",
    },
  ];
  return (
    <div className="paper paper-w doc">
      <div className="doc-top">
        <p className="doc-title">
          <ArrowUUpLeft size="1.1em" weight="light" aria-hidden />
          Back of the form: how each step is filed
        </p>
      </div>
      <table className="mech">
        <caption className="sr">The four steps of a sealed negotiation, where each runs, and what Base records</caption>
        <thead>
          <tr>
            <th scope="col">Step</th>
            <th scope="col">Contract or file</th>
            <th scope="col">What the chain sees</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.title}>
              <th scope="row">
                <span className="mech-head">
                  <span className="no">{i + 1}</span>
                  <span className="mech-step">
                    <span className="mech-name">
                      <r.icon size="1.1em" weight="light" aria-hidden />
                      {r.title}
                    </span>
                    <span className="mech-text">{r.text}</span>
                  </span>
                </span>
              </th>
              <td>
                <code>{r.where}</code>
              </td>
              <td>
                {r.sealed && (
                  <span className="blk blank" aria-hidden="true" />
                )}
                <span className="sees">{r.sees}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Verify({ runs, deployment, payments }: { runs: Run[]; deployment: Deployment; payments: Payments }) {
  const [deal, noDeal] = runs;
  const first = deal.rounds[0];
  const { policy } = deployment;
  const newcomerReviews = deployment.feedback.newcomer.length;
  const firstPayment = payments.calls.find((c) => c.transaction)?.transaction;
  const checks: { icon: Icon; title: string; body: React.ReactNode; extra: React.ReactNode }[] = [
    {
      icon: Receipt,
      title: "Open a commit transaction",
      body: (
        <>
          Its input is <span className="mono">commitOffer(negotiationId, hash)</span>. Decode it on Basescan: 32 bytes of
          hash, and no price.
        </>
      ),
      extra: (
        <div className="links">
          <ExtLink href={txUrl(first.buyer.commitTx)}>Buyer, round 1: {short(first.buyer.commitTx)}</ExtLink>
          <ExtLink href={txUrl(first.seller.commitTx)}>Seller, round 1: {short(first.seller.commitTx)}</ExtLink>
        </div>
      ),
    },
    {
      icon: TerminalWindow,
      title: "Recompute every hash from the transcripts",
      body: (
        <>
          The script rebuilds each hash from the published offer and salt and compares it with the calldata on Base
          Sepolia: {verifyChecks(deal.rounds.length, true)} checks for #{deal.negotiationId},{" "}
          {verifyChecks(noDeal.rounds.length, false)} for #{noDeal.negotiationId}. Run it in bash or zsh from the
          repository root after <span className="mono">npm install</span>.
        </>
      ),
      extra: <CopyCommand label="Hash verification commands" command={runs.map((r) => `RUN=${r.file} npm run verify:run`).join("\n")} />,
    },
    {
      icon: FileCode,
      title: "Read the contracts",
      body: "Both are verified on Sourcify with an exact match to the source in the repository.",
      extra: (
        <div className="links">
          <ExtLink href={SOURCIFY(deployment.chainId, deployment.contracts.SealedNegotiation)}>
            SealedNegotiation {short(deployment.contracts.SealedNegotiation)}
          </ExtLink>
          <ExtLink href={SOURCIFY(deployment.chainId, deployment.contracts.ReputationGate)}>
            ReputationGate {short(deployment.contracts.ReputationGate)}
          </ExtLink>
        </div>
      ),
    },
    {
      icon: UsersThree,
      title: "Check who may negotiate",
      body: `The gate reads the canonical ERC-8004 registries. A third agent, #${deployment.agents.newcomer.agentId}, has ${newcomerReviews} ${newcomerReviews === 1 ? "review" : "reviews"}, below the minimum of ${policy.minFeedbackCount}, and the gate rejected it in our smoke test.`,
      extra: (
        <div className="links">
          <ExtLink href={addressUrl(deployment.registries.identity)}>
            Identity Registry {short(deployment.registries.identity)}
          </ExtLink>
          <ExtLink href={addressUrl(deployment.registries.reputation)}>
            Reputation Registry {short(deployment.registries.reputation)}
          </ExtLink>
        </div>
      ),
    },
    {
      icon: Coins,
      title: "Check the payments",
      body: "The script reads the price and both wallets from the contract, confirms each USDC transfer on Base Sepolia, checks that no other payment from the buyer to the seller happened during the run, and checks that every draw from the Base Account stayed inside its Spend Permission.",
      extra: (
        <>
          {firstPayment && (
            <div className="links">
              <ExtLink href={txUrl(firstPayment)}>Payment 1: {short(firstPayment)}</ExtLink>
            </div>
          )}
          <CopyCommand label="Payment verification command" command={`npm run verify:payments -- ${payments.file}`} />
        </>
      ),
    },
  ];
  return (
    <div className="paper paper-w doc">
      <div className="doc-top">
        <p className="doc-title">
          <ArrowUUpLeft size="1.1em" weight="light" aria-hidden />
          Reverse of order No. {deal.negotiationId}: checking instructions
        </p>
      </div>
      <ol className="checks">
        {checks.map((c, i) => (
          <li key={c.title}>
            <span className="no">
              {pad2(i + 1)}
              <c.icon size="1.25em" weight="light" aria-hidden />
            </span>
            <div>
              <h3>{c.title}</h3>
              <p>{c.body}</p>
              {c.extra}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function Business({ deal, payments }: { deal: Run; payments: Payments }) {
  const settled = BigInt(deal.settledPrice!);
  const buyerLimit = BigInt(deal.agents.buyer.limit);
  const sellerEarns = EXAMPLE_CALLS * BigInt(payments.usdcPerCall);
  const fee = (sellerEarns * FEE_BPS) / 10_000n;
  const feePct = `${(Number(FEE_BPS) / 100).toFixed(2)}%`;
  return (
    <div className="paper paper-y doc">
      <div className="doc-top">
        <p className="doc-title">
          <Percent size="1.1em" weight="light" aria-hidden />
          Fee schedule, planned
        </p>
      </div>
      <div className="biz">
        <div className="fee">
          <span className="lbl">Fee</span>
          <p className="figure">{feePct}</p>
          <p className="cap">of the value paid at a price settled through Sealed, charged to the seller</p>
        </div>
        <div className="biz-txt">
          <div>
            <h3>
              <Storefront size="1.1em" weight="light" aria-hidden />
              First customers
            </h3>
            <p>
              API sellers that already charge per call over x402. Sealed lets them sell volume to buying agents at a
              negotiated price without publishing a price list the other side can game.
            </p>
          </div>
          <div>
            <h3>
              <Scales size="1.1em" weight="light" aria-hidden />
              Why they pay
            </h3>
            <p>
              A buyer agent that cannot be squeezed is willing to commit to volume. In negotiation #{deal.negotiationId}{" "}
              the seller would have accepted {dollars(deal.agents.seller.limit)} per 1,000 calls and closed at{" "}
              {dollars(settled)}, while the buyer paid {dollars(buyerLimit - settled)} less than its{" "}
              {dollars(buyerLimit)} limit. In an example month of {EXAMPLE_CALLS.toLocaleString("en-US")} calls at{" "}
              {usdc(payments.usdcPerCall)}, the seller earns {money(sellerEarns)} and Sealed{" "}
              {money(fee)}.
            </p>
          </div>
        </div>
        <div className="biz-foot">
          <div>
            <h3>
              <ListNumbers size="1.1em" weight="light" aria-hidden />
              Next, in order
            </h3>
            <ol className="next">
              {[
                "Move the referee into an attested enclave",
                "Code the fee into settlement",
                "Deploy on Base mainnet",
                "Run a pilot with one x402 seller",
              ].map((item, i) => (
                <li key={item}>
                  <b>{i + 1}</b>
                  {item}
                </li>
              ))}
            </ol>
          </div>
          <div>
            <h3>
              <Signature size="1.1em" weight="light" aria-hidden />
              Team
            </h3>
            <p>
              <span className="sig">Kevin Soto Burgos</span>
            </p>
            <p>Founder, will build Sealed full-time after the event.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Limits({ deployment, separated }: { deployment: Deployment; separated: Run }) {
  const limits: { icon: Icon; title: string; text: React.ReactNode }[] = [
    {
      icon: Eye,
      title: "The referee is trusted with privacy",
      text: (
        <>
          It sees both offers each round. It cannot forge or alter a deal, because settlement needs both agents&apos;
          signatures over the exact pair of hashes. In negotiation #{separated.negotiationId} the referee ran as its own
          process, holding no agent key, and reached each agent over HTTP; it still sees both numbers. The production
          path is an attested enclave (TEE) or threshold encryption. Transcript:{" "}
          <span className="mono">{separated.file}</span>,{" "}
          <ExtLink href={txUrl(separated.createTx)}>created {short(separated.createTx)}</ExtLink>
        </>
      ),
    },
    {
      icon: Flask,
      title: "Testnet money, demo data",
      text: "The payments move testnet USDC on Base Sepolia. The API the buyer pays for returns a labelled demo payload.",
    },
    {
      icon: UserList,
      title: "The reputation is seeded",
      text: `The reviews that admit agents #${deployment.agents.buyer.agentId} and #${deployment.agents.seller.agentId} were written by our own seed script, and the repository labels them that way.`,
    },
    {
      icon: Key,
      title: "The transcripts publish secrets on purpose",
      text: "Price limits, offers and salts are published so you can recompute every hash. A real agent keeps them private.",
    },
  ];
  return (
    <div className="paper paper-p doc">
      <div className="doc-top">
        <p className="doc-title">
          <Scroll size="1.1em" weight="light" aria-hidden />
          Terms
        </p>
      </div>
      <ol className="checks terms">
        {limits.map((l, i) => (
          <li key={l.title}>
            <span className="no">
              {pad2(i + 1)}
              <l.icon size="1.25em" weight="light" aria-hidden />
            </span>
            <div>
              <h3>{l.title}</h3>
              <p>{l.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
