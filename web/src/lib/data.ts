import fs from "fs";
import path from "path";

/**
 * Everything the page shows comes from files committed in the repo, read at
 * build time: the demo transcripts in demo-runs/ and the deployment record in
 * deployments/. Nothing on the page is typed by hand.
 */

const ROOT = path.join(process.cwd(), "..");
const FEATURED = ["baseSepolia-deal-6.json", "baseSepolia-no-deal-7.json"];
const PAYMENTS = "baseSepolia-x402-6-base-account.json";

export interface Side {
  offer: string;
  proposedOffer?: string;
  correction?: "limit" | "no-backtracking";
  stance: string;
  explanation: string;
  commitIndex: number;
  commitment: string;
  commitTx: string;
  salt: string;
}

export interface Round {
  round: number;
  buyer: Side;
  seller: Side;
  crossed: boolean;
}

export interface Run {
  scenario: "deal" | "no-deal";
  chainId: number;
  contract: string;
  relay: string;
  model: string;
  terms: string;
  referencePrice: string;
  agents: Record<"buyer" | "seller", { agentId: string; wallet: string; limit: string }>;
  negotiationId: string;
  createTx: string;
  deadline: string;
  rounds: Round[];
  outcome: "settled" | "expired" | "aborted";
  settleTx?: string;
  expireTx?: string;
  settledPrice?: string;
  file: string;
}

export interface Deployment {
  chainId: number;
  registries: { identity: string; reputation: string };
  contracts: { ReputationGate: string; SealedNegotiation: string };
  agents: Record<"buyer" | "seller" | "newcomer", { agentId: string; wallet: string }>;
  policy: { reviewers: string[]; minFeedbackCount: number; minAverageValue: number; decimals: number };
  admission: Record<"buyer" | "seller" | "newcomer", { clears: boolean }>;
  feedback: Record<"buyer" | "seller" | "newcomer", string[]>;
}

export interface PaymentCall {
  url: string;
  paid: boolean;
  status: number;
  transaction?: string;
  refusal?: string;
}

export interface Payments {
  negotiationId: string;
  settledPrice: string;
  usdcPerCall: string;
  asset: string;
  buyer: string;
  seller: string;
  complete: boolean;
  calls: PaymentCall[];
  sellerUsdcBefore: string;
  sellerUsdcAfter: string;
  budget: {
    baseAccount: string;
    spendPermissionManager: string;
    permission: { allowance: string; period: number };
    approveTx: string;
    draws: string[];
    overBudgetDraw?: { reason: string };
  };
  file: string;
}

const read = <T,>(...parts: string[]): T => JSON.parse(fs.readFileSync(path.join(ROOT, ...parts), "utf8"));

export function loadRuns(): Run[] {
  return FEATURED.map((file) => ({ ...read<Omit<Run, "file">>("demo-runs", file), file: `demo-runs/${file}` }));
}

export function loadPayments(): Payments {
  return { ...read<Omit<Payments, "file">>("demo-runs", PAYMENTS), file: `demo-runs/${PAYMENTS}` };
}

export function loadDeployment(): Deployment {
  return read<Deployment>("deployments", "baseSepolia.json");
}
