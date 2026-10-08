import { Contract, id, type Provider } from "ethers";

/**
 * What a settled Sealed negotiation means for payment, read from the contract.
 *
 * Sealed settles a price; x402 moves the money. This module is the bridge: the
 * price per call and the address that gets paid both come from the chain, so
 * neither side can quietly change the terms after the negotiation closes.
 */

export const BASE_SEPOLIA = "eip155:84532" as const;
/** Circle's USDC on Base Sepolia, the asset x402's exact scheme uses there. */
export const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const USDC_DECIMALS = 6n;

/**
 * The terms the demo negotiations settle under. Its hash is the negotiation's
 * termsSchema, so a price is only read as "US cents per 1,000 calls" when the
 * negotiation was opened under these exact terms.
 */
export const API_TERMS = "Demo: price per 1,000 calls to a market-data API, 30-day term, in US cents";
const CALLS_PER_PRICE_UNIT = 1000n;
/**
 * The longest a signed payment may stay valid. x402 servers default to 300 s;
 * a longer window would let a seller hold the authorization and settle it long
 * after the call it paid for.
 */
export const MAX_PAYMENT_WINDOW_SECONDS = 300;
const CENTS_PER_DOLLAR = 100n;
const STATUS_SETTLED = 3n;

const GET_NEGOTIATION_ABI = [
  "function getNegotiation(uint256 negotiationId) view returns ((address buyerWallet, address sellerWallet, uint256 buyerAgentId, uint256 sellerAgentId, bytes32 buyerCommitment, bytes32 sellerCommitment, uint32 buyerCommitIndex, uint32 sellerCommitIndex, uint64 deadline, uint8 status, uint256 settledPrice, bytes32 termsSchema))",
];

export interface Deal {
  negotiationId: bigint;
  contract: string;
  buyer: string;
  seller: string;
  /** The settled price exactly as the contract stores it: US cents per 1,000 calls. */
  settledPrice: bigint;
  /** What one call costs, in atomic USDC (6 decimals). */
  usdcPerCall: bigint;
}

/** 4200 cents per 1,000 calls is $0.042 per call, which is 42,000 atomic USDC. */
export function usdcPerCall(centsPerThousandCalls: bigint): bigint {
  const scaled = centsPerThousandCalls * 10n ** USDC_DECIMALS;
  const divisor = CENTS_PER_DOLLAR * CALLS_PER_PRICE_UNIT;
  if (scaled % divisor !== 0n) throw new Error(`price ${centsPerThousandCalls} does not divide into whole atomic USDC per call`);
  return scaled / divisor;
}

/** The same amount as an x402 money string, without floating point. */
export function usdcToMoney(atomic: bigint): string {
  const whole = atomic / 10n ** USDC_DECIMALS;
  const fraction = (atomic % 10n ** USDC_DECIMALS).toString().padStart(Number(USDC_DECIMALS), "0");
  return `$${whole}.${fraction}`;
}

/** Reads a negotiation and refuses anything that has not settled. */
export async function readDeal(provider: Provider, contract: string, negotiationId: bigint): Promise<Deal> {
  const sealed = new Contract(contract, GET_NEGOTIATION_ABI, provider);
  const n = await sealed.getNegotiation(negotiationId);
  if (BigInt(n.status) !== STATUS_SETTLED) throw new Error(`negotiation ${negotiationId} has not settled`);
  if (n.termsSchema !== id(API_TERMS)) throw new Error(`negotiation ${negotiationId} was not opened under the API terms`);
  return {
    negotiationId,
    contract,
    buyer: n.buyerWallet,
    seller: n.sellerWallet,
    settledPrice: n.settledPrice,
    usdcPerCall: usdcPerCall(n.settledPrice),
  };
}

/** The part of an x402 payment requirement the buyer checks before it signs anything. */
export interface Requirement {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
}

/**
 * Returns why the buyer must refuse this requirement, or undefined if it
 * matches the deal exactly: the agreed per-call price, in USDC on Base Sepolia,
 * to the seller wallet that took part in the negotiation.
 */
export function refusalReason(requirement: Requirement, deal: Deal): string | undefined {
  if (requirement.scheme !== "exact") return `scheme ${requirement.scheme} is not exact`;
  if (requirement.network !== BASE_SEPOLIA) return `network ${requirement.network} is not Base Sepolia`;
  if (requirement.asset.toLowerCase() !== USDC_BASE_SEPOLIA.toLowerCase()) return `asset ${requirement.asset} is not USDC`;
  if (requirement.payTo.toLowerCase() !== deal.seller.toLowerCase()) {
    return `payee ${requirement.payTo} is not the seller of negotiation ${deal.negotiationId}`;
  }
  if (BigInt(requirement.amount) !== deal.usdcPerCall) {
    return `asks ${requirement.amount} atomic USDC per call; negotiation ${deal.negotiationId} settled at ${deal.usdcPerCall}`;
  }
  if (!(requirement.maxTimeoutSeconds > 0 && requirement.maxTimeoutSeconds <= MAX_PAYMENT_WINDOW_SECONDS)) {
    return `wants the payment valid for ${requirement.maxTimeoutSeconds} s; the limit is ${MAX_PAYMENT_WINDOW_SECONDS} s`;
  }
  return undefined;
}
