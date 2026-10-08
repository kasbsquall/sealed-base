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
  crossed: boolean;
  buyer: SealedSide;
  seller: SealedSide;
}

export type DetailPart = string | { code: string };

export interface Step {
  n: number;
  slot: string;
  title: string;
  detail: DetailPart[];
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
  budget: { line: string; tx: TxRef };
  paid: string;
  refused?: string;
  overBudget?: string;
  /** "Fourth draw": the draw Base refused, counted after the ones it allowed. */
  nextDraw: string;
  steps: Step[];
}

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

export function orderView(deal: Run, payments: Payments, admitted: OrderView["admitted"]): OrderView {
  const last = deal.rounds[deal.rounds.length - 1];
  const paidCalls = payments.calls.filter((c) => c.paid);
  const refusals = payments.calls.filter((c) => c.refusal);
  const refusal = refusals[0]?.refusal;
  const asked = refusal ? askedPrice(refusal) : undefined;
  const perCall = usdc(payments.usdcPerCall);
  const allowance = usdc(payments.budget.permission.allowance);
  const over = payments.budget.overBudgetDraw?.reason;
  const nextDraw = ordinal(payments.budget.draws.length + 1);

  const rounds: OrderRound[] = deal.rounds.map((r) => ({
    n: r.round,
    slot: `r${r.round}`,
    crossed: r.crossed,
    buyer: sealed(r.buyer.offer, r.buyer.commitment, r.buyer.commitTx),
    seller: sealed(r.seller.offer, r.seller.commitment, r.seller.commitTx),
  }));

  const steps: Omit<Step, "n">[] = [
    {
      slot: "adm",
      title: "Both agents admitted",
      detail: [
        `ERC-8004 agents #${deal.agents.buyer.agentId} and #${deal.agents.seller.agentId} clear the reputation gate, and negotiation #${deal.negotiationId} opens on Base Sepolia.`,
      ],
      links: [{ label: `Open ${short(deal.createTx)}`, href: txUrl(deal.createTx) }],
    },
    ...deal.rounds.map((r) => ({
      slot: `r${r.round}`,
      title: r.crossed ? `Round ${r.round}: a deal is possible` : `Round ${r.round}: no deal yet`,
      detail: [
        r.crossed
          ? "Both agents lock a sealed offer on Base. The referee says the buyer now offers at least what the seller asks."
          : "Both agents lock a sealed offer on Base. The referee says the offers do not meet, and neither agent learns the other's number.",
      ],
      links: [
        { label: `Buyer ${short(r.buyer.commitTx)}`, href: txUrl(r.buyer.commitTx) },
        { label: `Seller ${short(r.seller.commitTx)}`, href: txUrl(r.seller.commitTx) },
      ],
    })),
    {
      slot: "set",
      title: `Settled at ${dollars(deal.settledPrice!)} per 1,000 calls`,
      detail: [
        `One transaction opens both final offers, ${dollars(last.buyer.offer)} and ${dollars(last.seller.offer)}, and settles halfway. These are the first offers anyone outside the referee can read.`,
      ],
      links: [{ label: `Settle ${short(deal.settleTx!)}`, href: txUrl(deal.settleTx!) }],
    },
    {
      slot: "budget",
      title: `A budget of ${allowance} a day`,
      detail: [
        "The principal's USDC sits in a Base Account. It grants the buyer agent a Spend Permission, and the agent holds no USDC of its own.",
      ],
      links: [{ label: `Permission ${short(payments.budget.approveTx)}`, href: txUrl(payments.budget.approveTx) }],
    },
    {
      slot: "paid",
      title: `Paid ${paidCalls.length} calls at ${perCall} in USDC`,
      detail: [
        "Before each call the agent draws its price from the Base Account, then pays the seller's API over x402 at the settled price.",
      ],
      links: paidCalls.map((c, i) => ({ label: `Payment ${i + 1}`, href: txUrl(c.transaction!) })),
    },
    ...(asked
      ? [
          {
            slot: "refused",
            title: `Refused a call at ${asked}`,
            detail: ["The seller asked for more than the deal. The buyer refused before signing anything, so no money moved."],
            links: [],
          },
        ]
      : []),
    ...(over
      ? [
          {
            slot: "over",
            title: `Base refused a ${nextDraw} draw`,
            detail: [
              "Drawing one more call would pass the daily budget. The SpendPermissionManager rejects it: ",
              { code: over },
              ", checked without a transaction.",
            ],
            links: [],
          },
        ]
      : []),
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
    budget: {
      line: `${allowance} USDC a day in the Base Account`,
      tx: { label: short(payments.budget.approveTx), href: txUrl(payments.budget.approveTx) },
    },
    paid: `${paidCalls.length} calls at ${perCall} USDC each, over x402`,
    refused: asked ? `${refusals.length} ${refusals.length === 1 ? "call" : "calls"} at ${asked}, before signing` : undefined,
    overBudget: over ? `Rejected: ${over}` : undefined,
    nextDraw: `${nextDraw.charAt(0).toUpperCase()}${nextDraw.slice(1)} draw`,
    steps: steps.map((s, i) => ({ ...s, n: i + 1 })),
  };
}
