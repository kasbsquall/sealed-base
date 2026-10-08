import { x402Client, x402HTTPClient, wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { BASE_SEPOLIA, refusalReason, type Deal } from "./deal";

export interface CallResult {
  url: string;
  paid: boolean;
  status: number;
  /** Settlement transaction on Base Sepolia, as reported by the seller. Confirm it on-chain before trusting it. */
  transaction?: string;
  /** Amount the facilitator reported settling, when it reported one. */
  amount?: string;
  refusal?: string;
  /** Why a served response is not counted as paid. */
  problem?: string;
}

/** What the seller reports after settling, in the fields the buyer checks. */
export interface Settlement {
  success: boolean;
  errorReason?: string;
  payer?: string;
  transaction: string;
  network: string;
  amount?: string;
}

const ABORTED = "Payment creation aborted: ";
const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

/**
 * Returns why a seller's settlement report cannot count as a payment by this
 * buyer, or undefined. The report arrives in a header the seller controls, so
 * it is only a claim; the transaction itself is checked on-chain afterwards.
 */
export function settlementProblem(settlement: Settlement, deal: Deal): string | undefined {
  if (!settlement.success) return `settlement failed: ${settlement.errorReason ?? "no reason given"}`;
  if (!TX_HASH.test(settlement.transaction ?? "")) return `reported transaction ${settlement.transaction} is not a transaction hash`;
  if (settlement.network !== BASE_SEPOLIA) return `reported network ${settlement.network} is not Base Sepolia`;
  if (settlement.payer && settlement.payer.toLowerCase() !== deal.buyer.toLowerCase()) {
    return `reported payer ${settlement.payer} is not the buyer`;
  }
  return undefined;
}

/**
 * The buyer agent's paying client. It pays only what the negotiation settled:
 * before signing, it compares the server's x402 requirement with the deal read
 * from the contract and aborts on any difference in price, payee, asset,
 * network or payment window. A seller cannot raise its price after the
 * negotiation closes.
 */
export function createBuyerClient(privateKey: `0x${string}`, deal: Deal) {
  const signer = privateKeyToAccount(privateKey);
  if (signer.address.toLowerCase() !== deal.buyer.toLowerCase()) {
    throw new Error(`key is for ${signer.address}, but the buyer of negotiation ${deal.negotiationId} is ${deal.buyer}`);
  }

  const client = new x402Client().register("eip155:*", new ExactEvmScheme(signer)).onBeforePaymentCreation(async ({ selectedRequirements }) => {
    const reason = refusalReason(selectedRequirements, deal);
    return reason ? { abort: true as const, reason } : undefined;
  });
  const fetchWithPayment = wrapFetchWithPayment(fetch, client);
  const http = new x402HTTPClient(client);

  return async function call(url: string): Promise<CallResult> {
    let response: Response;
    try {
      response = await fetchWithPayment(url, { method: "GET" });
    } catch (error) {
      // @x402/fetch wraps the hook's abort as "Failed to create payment payload: Payment creation aborted: <reason>".
      const message = error instanceof Error ? error.message : "";
      const at = message.indexOf(ABORTED);
      if (at >= 0) return { url, paid: false, status: 402, refusal: message.slice(at + ABORTED.length) };
      throw error;
    }
    // Only a successful paid response carries a settlement header.
    if (!response.ok) return { url, paid: false, status: response.status };

    let settlement: Settlement;
    try {
      settlement = http.getPaymentSettleResponse((name) => response.headers.get(name));
    } catch {
      return { url, paid: false, status: response.status, problem: "served without a settlement report" };
    }
    const problem = settlementProblem(settlement, deal);
    return {
      url,
      paid: !problem,
      status: response.status,
      transaction: settlement.transaction,
      amount: settlement.amount,
      ...(problem ? { problem } : {}),
    };
  };
}
