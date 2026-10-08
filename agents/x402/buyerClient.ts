import { x402Client, x402HTTPClient, wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { refusalReason, type Deal } from "./deal";

export interface CallResult {
  url: string;
  paid: boolean;
  status: number;
  /** Settlement transaction on Base Sepolia, when the call was paid. */
  transaction?: string;
  amount?: string;
  refusal?: string;
}

/**
 * The buyer agent's paying client. It pays only what the negotiation settled:
 * before signing, it compares the server's x402 requirement with the deal read
 * from the contract and aborts on any difference in price, payee, asset or
 * network. A seller cannot raise its price after the negotiation closes.
 */
export function createBuyerClient(privateKey: `0x${string}`, deal: Deal) {
  const signer = privateKeyToAccount(privateKey);
  if (signer.address.toLowerCase() !== deal.buyer.toLowerCase()) {
    throw new Error(`key is for ${signer.address}, but the buyer of negotiation ${deal.negotiationId} is ${deal.buyer}`);
  }

  let lastRefusal: string | undefined;
  const client = new x402Client().register("eip155:*", new ExactEvmScheme(signer)).onBeforePaymentCreation(async ({ selectedRequirements }) => {
    lastRefusal = refusalReason(selectedRequirements, deal);
    return lastRefusal ? { abort: true as const, reason: lastRefusal } : undefined;
  });
  const fetchWithPayment = wrapFetchWithPayment(fetch, client);
  const http = new x402HTTPClient(client);

  return async function call(url: string): Promise<CallResult> {
    lastRefusal = undefined;
    try {
      const response = await fetchWithPayment(url, { method: "GET" });
      // Only a successful paid response carries a settlement header.
      if (!response.ok) return { url, paid: false, status: response.status };
      const settlement = http.getPaymentSettleResponse((name) => response.headers.get(name));
      return {
        url,
        paid: !!settlement?.success,
        status: response.status,
        transaction: settlement?.transaction,
        amount: settlement?.amount ?? deal.usdcPerCall.toString(),
      };
    } catch (error) {
      if (lastRefusal) return { url, paid: false, status: 402, refusal: lastRefusal };
      throw error;
    }
  };
}
