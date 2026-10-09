"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowsLeftRight, Cube, Intersect, Lock, LockKey, Play } from "@phosphor-icons/react";
import { commitmentHash, domainSeparator, newSalt } from "@/lib/commitment";
import { dollars, short } from "@/lib/format";
import { Stamp } from "../replay/Typed";

const ROUNDS = 3;
/** Each agent opens this share of its limit away from it, and reaches its limit in the last round. */
const OPENING_GAP = 0.05;
const MIN_CENTS = 100n;
const MAX_CENTS = 100_000n;
const ROUND_MS = 650;
const PRESETS = [
  { label: "Limits that overlap", buyer: "43.00", seller: "41.00" },
  { label: "Limits that don't", buyer: "36.00", seller: "43.00" },
];

type Sealed = { offer: bigint; hash: string };
type PracticeRound = { round: number; buyer: Sealed; seller: Sealed; crossed: boolean };
type Result = { buyerLimit: bigint; sellerLimit: bigint; rounds: PracticeRound[]; price?: bigint };

export interface PracticeProps {
  chainId: number;
  contract: string;
  buyerWallet: string;
  sellerWallet: string;
}

/** "43", "43.5" or "43.50" dollars to cents; undefined when it is not a usable price. */
function toCents(raw: string): bigint | undefined {
  const m = raw.trim().replace(/^\$/, "").match(/^(\d{1,4})(?:\.(\d{1,2}))?$/);
  if (!m) return undefined;
  const cents = BigInt(m[1]) * 100n + BigInt((m[2] ?? "0").padEnd(2, "0"));
  return cents >= MIN_CENTS && cents <= MAX_CENTS ? cents : undefined;
}

function offerFor(limit: bigint, round: number, side: "buyer" | "seller"): bigint {
  const gap = BigInt(Math.max(1, Math.round(Number(limit) * OPENING_GAP)));
  const room = (gap * BigInt(ROUNDS - round)) / BigInt(ROUNDS - 1);
  return side === "buyer" ? limit - room : limit + room;
}

function negotiate(props: PracticeProps, buyerLimit: bigint, sellerLimit: bigint): Result {
  const domain = domainSeparator(props.chainId, props.contract);
  const seal = (offer: bigint, party: string, round: number): Sealed => ({
    offer,
    // Practice negotiation id 0 is never created on Base, so these hashes can never match a real commitment.
    hash: commitmentHash({ domain, negotiationId: 0n, party, commitIndex: round - 1, offer, salt: newSalt() }),
  });
  const rounds: PracticeRound[] = [];
  for (let round = 1; round <= ROUNDS; round++) {
    const b = offerFor(buyerLimit, round, "buyer");
    const s = offerFor(sellerLimit, round, "seller");
    const crossed = b >= s;
    rounds.push({ round, buyer: seal(b, props.buyerWallet, round), seller: seal(s, props.sellerWallet, round), crossed });
    // Same rule as SealedNegotiation.settle: halfway, rounding toward the seller's offer.
    if (crossed) return { buyerLimit, sellerLimit, rounds, price: s + (b - s) / 2n };
  }
  return { buyerLimit, sellerLimit, rounds };
}

export function Practice(props: PracticeProps) {
  const [buyer, setBuyer] = useState(PRESETS[0].buyer);
  const [seller, setSeller] = useState(PRESETS[0].seller);
  const [result, setResult] = useState<Result>();
  const [shown, setShown] = useState(0);
  const outRef = useRef<HTMLDivElement>(null);

  const buyerCents = useMemo(() => toCents(buyer), [buyer]);
  const sellerCents = useMemo(() => toCents(seller), [seller]);
  const invalid = buyerCents === undefined || sellerCents === undefined;

  // Rounds arrive one at a time, as they would from the referee; reduced motion shows them all at once.
  useEffect(() => {
    if (!result) return;
    const instant = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (instant || shown >= result.rounds.length + 1) {
      if (instant) setShown(result.rounds.length + 1);
      return;
    }
    const t = window.setTimeout(() => setShown((n) => n + 1), shown === 0 ? 0 : ROUND_MS);
    return () => window.clearTimeout(t);
  }, [result, shown]);

  const run = (event: FormEvent) => {
    event.preventDefault();
    if (invalid) return;
    setResult(negotiate(props, buyerCents, sellerCents));
    setShown(0);
    window.requestAnimationFrame(() => outRef.current?.focus({ preventScroll: true }));
  };

  const done = result && shown > result.rounds.length;

  return (
    <div className="paper doc practice">
      <form className="pr-form js-only" onSubmit={run} noValidate>
        <div className="pr-fields">
          <PriceField
            id="pr-buyer"
            label="Buyer will pay at most"
            value={buyer}
            onChange={setBuyer}
            bad={buyerCents === undefined}
          />
          <PriceField
            id="pr-seller"
            label="Seller will accept no less than"
            value={seller}
            onChange={setSeller}
            bad={sellerCents === undefined}
          />
        </div>
        <div className="pr-presets" role="group" aria-label="Example limits">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="pr-chip"
              aria-pressed={buyer === p.buyer && seller === p.seller}
              onClick={() => {
                setBuyer(p.buyer);
                setSeller(p.seller);
              }}
            >
              {p.label}
              <span className="ty">
                {dollars(toCents(p.buyer)!)} / {dollars(toCents(p.seller)!)}
              </span>
            </button>
          ))}
        </div>
        <div className="f-act">
          <button type="submit" className="replay-btn" disabled={invalid}>
            <span className="box" aria-hidden>
              <Play weight="light" />
            </span>
            <span>
              <span className="bl">Seal and negotiate</span>
              <span className="bs">{ROUNDS} rounds, sealed in your browser</span>
            </span>
          </button>
          <p className="pr-rule">
            Each agent here follows a fixed rule: it opens 5% away from its limit and reaches its limit in round {ROUNDS}.
            In the live negotiations above, a local model chose every number.
          </p>
        </div>
      </form>
      <p className="nojs-note pr-nojs">The practice negotiation needs JavaScript. The two live negotiations above do not.</p>

      <div className="pr-out" ref={outRef} tabIndex={-1} aria-live="polite">
        {!result && (
          <p className="pr-empty">
            <LockKey size="1.1em" weight="light" aria-hidden />
            Nothing sealed yet. Pick two limits and press Seal and negotiate.
          </p>
        )}
        {result && (
          <>
            <div className="r-grid">
              <div className="hd">
                <p className="hd-l">Round</p>
              </div>
              <PartyHead role="buyer" limit={result.buyerLimit} wallet={props.buyerWallet} />
              <div className="hd">
                <p className="hd-l">Referee</p>
                <p>Opens both seals, answers only whether the offers meet</p>
              </div>
              <PartyHead role="seller" limit={result.sellerLimit} wallet={props.sellerWallet} />
              {result.rounds.slice(0, shown).map((r) => (
                <RoundRow key={r.round} round={r} />
              ))}
            </div>
            {done && <Outcome result={result} />}
          </>
        )}
      </div>
    </div>
  );
}

function PriceField(props: { id: string; label: string; value: string; onChange: (v: string) => void; bad: boolean }) {
  const { id, label, value, onChange, bad } = props;
  return (
    <div className="pr-field">
      <label className="lbl" htmlFor={id}>
        {label}
      </label>
      <div className="pr-input">
        <span aria-hidden>$</span>
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={bad}
          aria-describedby={`${id}-unit${bad ? ` ${id}-err` : ""}`}
        />
        <span className="pr-unit" id={`${id}-unit`}>
          per 1,000 calls
        </span>
      </div>
      {bad && (
        <p className="pr-err" id={`${id}-err`}>
          Enter a price from $1.00 to $1,000.00, with up to two decimals.
        </p>
      )}
    </div>
  );
}

function PartyHead({ role, limit, wallet }: { role: "buyer" | "seller"; limit: bigint; wallet: string }) {
  return (
    <div className="hd">
      <p className="hd-l">{role === "buyer" ? "Buyer" : "Seller"}</p>
      <span className="ty">
        {role === "buyer" ? "Will pay at most " : "Will accept no less than "}
        {dollars(limit)}
      </span>
      <p>Party {short(wallet)}, the demo agent&apos;s wallet</p>
    </div>
  );
}

function RoundRow({ round }: { round: PracticeRound }) {
  return (
    <>
      <div className="rc pr-row">
        <span className="rn">
          <small>Round</small>
          {round.round}
        </span>
      </div>
      <SealedCell role="Buyer" sealed={round.buyer} />
      <div className="pr-row">
        <span className="mlbl">Referee</span>
        <span className="verdict">
          {round.crossed ? (
            <Intersect size="1.1em" weight="light" aria-hidden />
          ) : (
            <ArrowsLeftRight size="1.1em" weight="light" aria-hidden />
          )}
          {round.crossed ? "The offers meet" : "The offers don't meet"}
        </span>
        <p className="why">
          {round.crossed ? "The buyer offers at least what the seller asks" : "Both agents learn only this"}
        </p>
        <p className="why pr-off">
          <Lock size="1em" weight="light" aria-hidden /> Off-chain, not recorded
        </p>
      </div>
      <SealedCell role="Seller" sealed={round.seller} />
    </>
  );
}

function SealedCell({ role, sealed }: { role: string; sealed: Sealed }) {
  return (
    <div className="pr-row">
      <span className="mlbl">{role}</span>
      <span className="px">{dollars(sealed.offer)}</span>
      <p className="why">Known only to this agent</p>
      <p className="cref calldata pr-hash">
        <Cube size="1em" weight="light" aria-hidden />
        <span>On Base</span>
        <span title={sealed.hash}>{short(sealed.hash, 10, 8)}</span>
      </p>
    </div>
  );
}

function Outcome({ result }: { result: Result }) {
  const last = result.rounds.at(-1)!;
  const hashes = result.rounds.length * 2;
  const misses = result.rounds.filter((r) => !r.crossed).length;
  return (
    <div className="r-out pr-done">
      <div className="stamp-zone">
        {result.price !== undefined ? (
          <Stamp
            lines={["Settled", dollars(result.price), "per 1,000 calls"]}
            label={`Settled at ${dollars(result.price)} per 1,000 calls`}
            tone="carbon"
          />
        ) : (
          <Stamp lines={["Expired", undefined, "No offer published"]} label="Expired, no offer published" tone="carbon" />
        )}
      </div>
      <div>
        <p className="big-line">
          {result.price !== undefined
            ? `Settled at ${dollars(result.price)} per 1,000 calls, halfway between the buyer's ${dollars(last.buyer.offer)} and the seller's ${dollars(last.seller.offer)}`
            : "The offers never met, so the negotiation would expire with no offer on-chain"}
        </p>
        <p>
          {result.price !== undefined
            ? `On Base this would be ${hashes} hashes and one settlement. The settlement opens only round ${last.round}'s two offers${misses ? `; the other ${misses * 2} stay hashes for good` : ""}.`
            : `On Base this would be ${hashes} hashes and an expiry. Neither limit, and no offer, would ever appear.`}
        </p>
        {misses > 0 && (
          <p>
            Each &ldquo;don&apos;t meet&rdquo; still told both agents one thing: the other side was beyond their own offer
            in that round. That is all the referee gives away.
          </p>
        )}
      </div>
    </div>
  );
}
