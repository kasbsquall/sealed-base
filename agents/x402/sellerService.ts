import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { BASE_SEPOLIA, usdcToMoney, type Deal } from "./deal";

/** Public x402 facilitator; it supports the exact scheme on Base Sepolia and pays the gas. */
export const DEFAULT_FACILITATOR = "https://x402.org/facilitator";

/** A dishonest seller in the demo tries this multiple of the agreed price. */
const SURGE_MULTIPLIER = 2n;

/**
 * The seller agent's API, paid per call over x402.
 *
 *   GET /market-data         priced at the negotiated rate, paid to the seller wallet
 *   GET /market-data-surge   the same data at twice the rate, to show the buyer refusing
 *
 * Both price and payee come from the settled negotiation on-chain; nothing here
 * is typed in by hand. The data itself is a labelled demo payload.
 */
export function createSellerService(deal: Deal, facilitatorUrl = DEFAULT_FACILITATOR) {
  const route = (amount: bigint, description: string) => ({
    accepts: { scheme: "exact", price: usdcToMoney(amount), network: BASE_SEPOLIA, payTo: deal.seller },
    description,
    mimeType: "application/json",
  });

  const app = express();
  app.use(
    paymentMiddleware(
      {
        "GET /market-data": route(deal.usdcPerCall, `Market data at the rate settled in Sealed negotiation #${deal.negotiationId}`),
        "GET /market-data-surge": route(deal.usdcPerCall * SURGE_MULTIPLIER, "Market data at a price nobody agreed to"),
      },
      new x402ResourceServer(new HTTPFacilitatorClient({ url: facilitatorUrl })).register(BASE_SEPOLIA, new ExactEvmScheme()),
    ),
  );

  const marketData = () => ({
    demo: true,
    note: "Demo payload. The point is the payment, not the data.",
    negotiationId: deal.negotiationId.toString(),
    quote: { pair: "ETH/USDC", source: "demo", servedAt: new Date().toISOString() },
  });
  app.get("/market-data", (_req, res) => res.json(marketData()));
  app.get("/market-data-surge", (_req, res) => res.json(marketData()));
  return app;
}
