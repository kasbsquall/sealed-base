"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import {
  ArrowsInLineHorizontal,
  ArrowsLeftRight,
  ArrowsOutLineHorizontal,
  Brain,
  Cube,
  FlagCheckered,
  HandPalm,
  IdentificationBadge,
  Intersect,
  Lock,
  Pause,
  SealCheck,
  Warning,
  type Icon,
} from "@phosphor-icons/react";
import type { Round, Run, Side } from "@/lib/data";
import { STANCE_LABEL, dollars, short, txUrl, addressUrl } from "@/lib/format";
import { useLiveStatus, type Live } from "./useLiveStatus";
import { ExtLink } from "./ExtLink";

type Lens = "agents" | "chain";
const LENSES: { id: Lens; label: string; icon: Icon }[] = [
  { id: "agents", label: "What each agent knew", icon: Brain },
  { id: "chain", label: "What the chain saw", icon: Cube },
];

const STANCE_ICON: Record<string, Icon> = {
  "open-with-room": ArrowsOutLineHorizontal,
  concede: ArrowsInLineHorizontal,
  hold: Pause,
  "final-at-limit": FlagCheckered,
};

/** Explanations are written by code in cents; the page shows dollars. Same numbers, one unit. */
const inDollars = (text: string) => text.replace(/\b\d{2,}\b/g, (n) => dollars(n));

const splitExplanation = (text: string) => {
  const [first, ...rest] = text.split(/(?<=\.)\s+/);
  return { move: inDollars(first), correction: rest.length ? inDollars(rest.join(" ")) : undefined };
};

const utc = (seconds: string) => new Date(Number(seconds) * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC";

const terms = (raw: string) => "Demo terms: " + raw.replace(/^Demo:\s*/, "").replace(/,\s*in US cents$/, "");

/** Arrow keys, Home and End over a row of options, per the WAI-ARIA tabs and radio group patterns. */
function nextIndex(key: string, current: number, count: number): number | undefined {
  if (key === "ArrowRight" || key === "ArrowDown") return (current + 1) % count;
  if (key === "ArrowLeft" || key === "ArrowUp") return (current + count - 1) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return undefined;
}

export function Ledger({ runs }: { runs: Run[] }) {
  const [active, setActive] = useState(0);
  const [lens, setLens] = useState<Lens>("agents");
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const lensButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const live = useLiveStatus(runs);
  const run = runs[active];
  const lensIndex = LENSES.findIndex((l) => l.id === lens);

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const next = nextIndex(event.key, active, runs.length);
    if (next === undefined) return;
    event.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  };

  const onLensKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const next = nextIndex(event.key, lensIndex, LENSES.length);
    if (next === undefined) return;
    event.preventDefault();
    setLens(LENSES[next].id);
    lensButtons.current[next]?.focus();
  };

  return (
    <div className="ledger">
      <div className="ledger-bar">
        <div className="segmented" role="tablist" aria-label="Negotiation">
          {runs.map((r, i) => {
            const label = r.outcome === "settled" ? "Deal" : "No deal";
            return (
              <button
                key={r.negotiationId}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                role="tab"
                id={`tab-${r.negotiationId}`}
                aria-label={`${label}, negotiation ${r.negotiationId}`}
                aria-selected={i === active}
                aria-controls={`panel-${r.negotiationId}`}
                tabIndex={i === active ? 0 : -1}
                onClick={() => setActive(i)}
                onKeyDown={onTabKey}
              >
                {r.outcome === "settled" ? (
                  <Intersect size={16} weight="light" aria-hidden />
                ) : (
                  <ArrowsLeftRight size={16} weight="light" aria-hidden />
                )}
                {label}
                <span className="tag">#{r.negotiationId}</span>
              </button>
            );
          })}
        </div>
        <div className="segmented" role="radiogroup" aria-label="Lens">
          {LENSES.map((l, i) => (
            <button
              key={l.id}
              ref={(el) => {
                lensButtons.current[i] = el;
              }}
              role="radio"
              aria-checked={lens === l.id}
              tabIndex={lens === l.id ? 0 : -1}
              onClick={() => setLens(l.id)}
              onKeyDown={onLensKey}
            >
              <l.icon size={16} weight="light" aria-hidden />
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div
        id={`panel-${run.negotiationId}`}
        role="tabpanel"
        tabIndex={0}
        aria-labelledby={`tab-${run.negotiationId}`}
        key={run.negotiationId}
        className="panel"
      >
        <div className="ledger-meta">
          <span>
            <strong className="num">Negotiation #{run.negotiationId}</strong> · {terms(run.terms)}
          </span>
          <span className="num">
            Public reference price <span className="mono">{dollars(run.referencePrice)}</span> · deadline{" "}
            <span className="mono">{utc(run.deadline)}</span>
          </span>
        </div>

        <div className="grid-row parties">
          <div className="corner col-label">Round</div>
          <Party run={run} role="buyer" lens={lens} />
          <div className="relay-head">
            <div className="col-label">Referee</div>
            <div className="mandate">Checks each offer against its hash, answers crossed or not</div>
          </div>
          <Party run={run} role="seller" lens={lens} />
        </div>

        {run.rounds.map((round, i) => (
          <RoundRow key={round.round} run={run} round={round} lens={lens} index={i} />
        ))}

        <Outcome run={run} lens={lens} live={live[run.negotiationId]} />

        <div className="ledger-foot">
          <Brain size={16} weight="light" className="icon" aria-hidden />
          <span>
            Each agent decided with <span className="mono">{run.model}</span> running locally, with up to two model calls
            per round and only its own mandate in view. The model picks a stance and a number. Code enforces the mandate
            and writes each explanation. Transcript: <span className="mono">{run.file}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function Party({ run, role, lens }: { run: Run; role: "buyer" | "seller"; lens: Lens }) {
  const agent = run.agents[role];
  return (
    <div className={`side-${role}`}>
      <div className="party-name">
        <IdentificationBadge size={16} weight="light" className="icon" aria-hidden />
        {role === "buyer" ? "Buyer" : "Seller"}
        <span className="mono">ERC-8004 agent #{agent.agentId}</span>
      </div>
      <div className="mandate swap" key={lens}>
        {lens === "agents" ? (
          <>
            {role === "buyer" ? "Will pay at most " : "Will accept no less than "}
            <span className="mono">{dollars(agent.limit)}</span>. Private to this agent, published here for the demo.
          </>
        ) : (
          <>
            Limit never sent on-chain. Wallet <ExtLink href={addressUrl(agent.wallet)}>{short(agent.wallet)}</ExtLink>
          </>
        )}
      </div>
    </div>
  );
}

function RoundRow({ run, round, lens, index }: { run: Run; round: Round; lens: Lens; index: number }) {
  const settlesHere = run.outcome === "settled" && round.round === run.rounds.at(-1)?.round;
  return (
    <div className="grid-row round" style={{ ["--i" as string]: Math.min(index, 7) }}>
      <div className="round-no">
        Round<b>{round.round}</b>
      </div>
      <SideCell run={run} side={round.buyer} lens={lens} disclosed={settlesHere} role="buyer" />
      <div className={`verdict${round.crossed ? " crossed" : ""} swap`} key={`v-${lens}`}>
        {lens === "agents" ? (
          round.crossed ? (
            <>
              <strong>
                <Intersect size={16} weight="light" aria-hidden /> Crossed
              </strong>
              <span>Buyer at or above seller</span>
            </>
          ) : (
            <>
              <strong>
                <ArrowsLeftRight size={16} weight="light" aria-hidden /> No cross
              </strong>
              <span>Both sides learn only this</span>
            </>
          )
        ) : (
          <>
            <strong>
              <Lock size={16} weight="light" aria-hidden /> Off-chain
            </strong>
            <span>The referee&apos;s answer is not recorded</span>
          </>
        )}
      </div>
      <SideCell run={run} side={round.seller} lens={lens} disclosed={settlesHere} role="seller" />
    </div>
  );
}

function SideCell({ run, side, lens, disclosed, role }: { run: Run; side: Side; lens: Lens; disclosed: boolean; role: string }) {
  const StanceIcon = STANCE_ICON[side.stance] ?? Pause;
  const { move, correction } = splitExplanation(side.explanation);
  return (
    <div className={`side-${role} swap`} key={lens}>
      {lens === "agents" ? (
        <>
          <div className="offer">{dollars(side.offer)}</div>
          <div className="stance">
            <StanceIcon size={16} weight="light" aria-hidden />
            Model: {STANCE_LABEL[side.stance] ?? side.stance}
            {side.correction ? ", overridden" : ""}
          </div>
          <p className="explanation">{move}</p>
          {correction && (
            <div className="correction">
              <HandPalm size={14} weight="light" className="icon" aria-hidden />
              <span>{correction}</span>
            </div>
          )}
        </>
      ) : (
        <>
          <span className="redaction">
            <span className="label">
              <Lock size={14} weight="light" aria-hidden /> Sealed offer
            </span>
            {short(side.commitment, 18, 16)}
          </span>
          <p className="calldata">
            commitOffer({run.negotiationId}, {short(side.commitment, 8, 6)})
          </p>
          <ExtLink href={txUrl(side.commitTx)}>Commit {short(side.commitTx)}</ExtLink>
          {disclosed && (
            <div className="disclosed">
              <SealCheck size={14} weight="light" aria-hidden /> Made public by the settlement: {dollars(side.offer)} (
              {side.offer} cents in calldata)
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Outcome({ run, lens, live }: { run: Run; lens: Lens; live: Live | undefined }) {
  const last = run.rounds.at(-1)!;
  const settled = run.outcome === "settled" && run.settledPrice;
  const closingTx = settled ? run.settleTx : run.expireTx;
  const sealedForGood = settled ? run.rounds.length - 1 : run.rounds.length;

  return (
    <div className="outcome">
      <div>
        <div className="eyebrow">
          {settled && <span className="signal" aria-hidden="true" />}
          {settled ? "Settled on Base Sepolia at" : "Closed on Base Sepolia as"}
        </div>
        {settled ? (
          <>
            <p className="hero-figure">{dollars(run.settledPrice!)}</p>
            <div className="outcome-unit">
              per 1,000 API calls, halfway between the buyer&apos;s <span className="mono">{dollars(last.buyer.offer)}</span>{" "}
              and the seller&apos;s <span className="mono">{dollars(last.seller.offer)}</span>
            </div>
          </>
        ) : (
          <>
            <p className="hero-word">Expired</p>
            <div className="outcome-unit">No price, and no offer on-chain</div>
          </>
        )}
      </div>

      <div className="outcome-copy">
        <div className="swap" key={lens}>
          {lens === "agents" ? (
            settled ? (
              <p>
                The buyer could pay up to {dollars(run.agents.buyer.limit)} and the seller would take{" "}
                {dollars(run.agents.seller.limit)} or more. Neither knew the other&apos;s limit. They met in round{" "}
                {last.round}, when both committed at their limits.
              </p>
            ) : (
              <p>
                The buyer could pay at most {dollars(run.agents.buyer.limit)}; the seller would take no less than{" "}
                {dollars(run.agents.seller.limit)}. No price satisfies both, so none of the {run.rounds.length} rounds
                crossed and the negotiation expired at its deadline.
              </p>
            )
          ) : settled ? (
            <p>
              The settlement is the only transaction that carries offers, and only round {last.round}&apos;s pair. The
              offers of the other {sealedForGood} {sealedForGood === 1 ? "round" : "rounds"} were never made public on-chain.
            </p>
          ) : (
            <p>
              The chain recorded {run.rounds.length * 2} hashes and an expiry. No offer from either side ever appears on
              Base.
            </p>
          )}
        </div>
        <div className="outcome-links">
          {closingTx && (
            <ExtLink href={txUrl(closingTx)}>
              {settled ? "Settlement" : "Expiry"} {short(closingTx)}
            </ExtLink>
          )}
          <ExtLink href={txUrl(run.createTx)}>Created {short(run.createTx)}</ExtLink>
        </div>
        <LiveLine live={live} />
      </div>
    </div>
  );
}

function LiveLine({ live }: { live: Live | undefined }) {
  const loading = !live || live.state === "loading";
  return (
    <div className="live" role="status" aria-live="polite" aria-busy={loading}>
      {loading ? (
        <>
          <span>Reading the contract on Base Sepolia</span>
          <span className="skeleton" aria-hidden="true" />
        </>
      ) : live.state === "error" ? (
        <>
          <Warning size={14} weight="light" className="icon" aria-hidden />
          <span>Could not reach the Base Sepolia RPC just now. The transaction links above still open on Basescan.</span>
        </>
      ) : (
        <>
          <Cube size={14} weight="light" className="icon" aria-hidden />
          <span>
            Live contract state: status <b>{live.status}</b>, settledPrice <b>{live.price}</b>
            {live.price === "0" ? " (never set)" : ` (US cents, ${dollars(live.price)})`}
          </span>
        </>
      )}
    </div>
  );
}
