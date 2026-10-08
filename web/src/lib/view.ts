import type { Payments, Run } from "./data";
import { dollars, ordinal, short, terms, txUrl, usdc, utc } from "./format";

/**
 * The view model of negotiation order No. 6: every string the triplicate set
 * and the order log type out, derived from the committed transcripts. Plain
 * data, so it can cross into the client components.
 */

export interface TxRef {
  label: string;
  href: string;
}

export interface SealedSide {
  price: string;
  /** The commitment hash Base stored for this offer, shortened, linking to its commit transaction. */
  hash: TxRef;
}

export interface OrderRound {
  n: number;
  slot: string;
  meet: boolean;
  buyer: SealedSide;
  seller: SealedSide;
}

export interface Step {
  n: number;
  slot: string;
  /** One line: what happened at this step. */
  title: string;
  links: TxRef[];
}

export interface OrderView {
  id: string;
  terms: string;
  reference: string;
  deadline: string;
  buyerId: string;
  sellerId: string;
  admitted: { buyer: boolean; seller: boolean };
  rounds: OrderRound[];
  settle: { line: string; price: string; tx: TxRef };
  allowance: { line: string; tx: TxRef };
  paid: string;
  refused?: string;
  overBudget?: string;
  /** "Fourth draw": the draw Base rejected, counted after the ones it allowed. */
  nextDraw: string;
  steps: Step[];
}

/** The referee's one bit, in words. */
export const meetLabel = (meet: boolean) => (meet ? "Offers meet" : "Offers apart");

/** "asks 84000 atomic USDC per call; …" as the asked price in dollars. */
export const askedPrice = (refusal: string) => {
  const asked = /^asks (\d+) atomic USDC per call/.exec(refusal)?.[1];
  return asked ? usdc(asked) : undefined;
};

/** "ExceededSpendPermission(168000, 126000)" as its two atomic USDC amounts. */
export const exceeded = (reason: string) => {
  const m = /\((\d+),\s*(\d+)\)/.exec(reason);
  return m ? { wanted: m[1], allowed: m[2] } : undefined;
};

const sealed = (price: string, commitment: string, commitTx: string): SealedSide => ({
  price: dollars(price),
  hash: { label: short(commitment), href: txUrl(commitTx) },
});

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function orderView(deal: Run, payments: Payments, admitted: OrderView["admitted"]): OrderView {
  const last = deal.rounds[deal.rounds.length - 1];
  const paidCalls = payments.calls.filter((c) => c.paid);
  const refusals = payments.calls.filter((c) => c.refusal);
  const refusal = refusals[0]?.refusal;
  const asked = refusal ? askedPrice(refusal) : undefined;
  const perCall = usdc(payments.usdcPerCall);
  const allowance = usdc(payments.budget.permission.allowance);
  const over = payments.budget.overBudgetDraw?.reason;
  const overAmounts = over ? exceeded(over) : undefined;
  const nextDraw = ordinal(payments.budget.draws.length + 1);

  const rounds: OrderRound[] = deal.rounds.map((r) => ({
    n: r.round,
    slot: `r${r.round}`,
    meet: r.crossed,
    buyer: sealed(r.buyer.offer, r.buyer.commitment, r.buyer.commitTx),
    seller: sealed(r.seller.offer, r.seller.commitment, r.seller.commitTx),
  }));

  const steps: Omit<Step, "n">[] = [
    {
      slot: "adm",
      title: `Agents #${deal.agents.buyer.agentId} and #${deal.agents.seller.agentId} admitted, negotiation #${deal.negotiationId} opened`,
      links: [{ label: `Open ${short(deal.createTx)}`, href: txUrl(deal.createTx) }],
    },
    ...deal.rounds.map((r) => ({
      slot: `r${r.round}`,
      title: `Round ${r.round}: both offers sealed, ${meetLabel(r.crossed).toLowerCase()}`,
      links: [
        { label: `Buyer ${short(r.buyer.commitTx)}`, href: txUrl(r.buyer.commitTx) },
        { label: `Seller ${short(r.seller.commitTx)}`, href: txUrl(r.seller.commitTx) },
      ],
    })),
    {
      slot: "set",
      title: `Settled at ${dollars(deal.settledPrice!)} per 1,000 calls; ${dollars(last.buyer.offer)} and ${dollars(last.seller.offer)} opened`,
      links: [{ label: `Settle ${short(deal.settleTx!)}`, href: txUrl(deal.settleTx!) }],
    },
    {
      slot: "allowance",
      title: `A daily allowance of ${allowance}, granted from the owner's Base Account`,
      links: [{ label: `Permission ${short(payments.budget.approveTx)}`, href: txUrl(payments.budget.approveTx) }],
    },
    {
      slot: "paid",
      title: `Paid ${paidCalls.length} calls at ${perCall} in USDC each, over x402`,
      links: paidCalls.map((c, i) => ({ label: `Payment ${i + 1}`, href: txUrl(c.transaction!) })),
    },
    ...(asked
      ? [{ slot: "refused", title: `The buyer refused a call at ${asked}, before signing`, links: [] }]
      : []),
    ...(over ? [{ slot: "over", title: `Base rejected a ${nextDraw} draw over the allowance`, links: [] }] : []),
  ];

  return {
    id: deal.negotiationId,
    terms: terms(deal.terms),
    reference: `${dollars(deal.referencePrice)} per 1,000 calls`,
    deadline: utc(deal.deadline),
    buyerId: deal.agents.buyer.agentId,
    sellerId: deal.agents.seller.agentId,
    admitted,
    rounds,
    settle: {
      line: `${dollars(last.buyer.offer)} and ${dollars(last.seller.offer)} opened in one transaction, settled halfway`,
      price: dollars(deal.settledPrice!),
      tx: { label: short(deal.settleTx!), href: txUrl(deal.settleTx!) },
    },
    allowance: {
      line: `${allowance} in USDC a day`,
      tx: { label: short(payments.budget.approveTx), href: txUrl(payments.budget.approveTx) },
    },
    paid: `${paidCalls.length} calls at ${perCall} in USDC each, over x402`,
    refused: asked ? `${refusals.length} ${refusals.length === 1 ? "call" : "calls"} at ${asked}, before signing` : undefined,
    overBudget: overAmounts
      ? `Rejected by Base: ${usdc(overAmounts.wanted)} today would pass the ${usdc(overAmounts.allowed)} allowance`
      : over
        ? `Rejected by Base: ${over}`
        : undefined,
    nextDraw: `${capital(nextDraw)} draw`,
    steps: steps.map((s, i) => ({ ...s, n: i + 1 })),
  };
}
