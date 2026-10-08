import "dotenv/config";
import fs from "fs";
import type { Server } from "http";
import { Contract, JsonRpcProvider } from "ethers";
import { readDeal, USDC_BASE_SEPOLIA, usdcToMoney } from "../agents/x402/deal";
import { createSellerService, DEFAULT_FACILITATOR } from "../agents/x402/sellerService";
import { createBuyerClient, type CallResult } from "../agents/x402/buyerClient";

/**
 * After a Sealed negotiation settles, the buyer agent pays the seller agent's
 * API per call over x402, at the settled price, in USDC on Base Sepolia.
 *
 *   1. reads the settled negotiation: price per call and seller wallet,
 *   2. starts the seller's paywalled API on localhost, priced from the chain,
 *   3. the buyer makes PAID_CALLS calls; the x402 facilitator settles each one,
 *   4. the buyer calls the surge endpoint (twice the price) and refuses to pay.
 *
 * Writes demo-runs/<network>-x402-<negotiationId>.json. Check it with
 *   npx tsx scripts/verify-payments.ts demo-runs/baseSepolia-x402-6.json
 *
 *   npx tsx scripts/pay-at-settled-price.ts            (negotiation 6)
 *   NEGOTIATION_ID=6 PAID_CALLS=3 npx tsx scripts/pay-at-settled-price.ts
 */

const RPC = process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org";
const PORT = 4021;
const RECEIPT_TIMEOUT_MS = 120_000;
const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];

async function main() {
  const deployment = JSON.parse(fs.readFileSync("deployments/baseSepolia.json", "utf8"));
  const keys = JSON.parse(fs.readFileSync(".demo-wallets.json", "utf8"));
  const negotiationId = BigInt(process.env.NEGOTIATION_ID ?? "6");
  const paidCalls = Number(process.env.PAID_CALLS ?? "3");
  const facilitator = process.env.X402_FACILITATOR_URL ?? DEFAULT_FACILITATOR;
  const provider = new JsonRpcProvider(RPC);

  const deal = await readDeal(provider, deployment.contracts.SealedNegotiation, negotiationId);
  console.log(
    `Negotiation #${negotiationId} settled at ${deal.settledPrice} US cents per 1,000 calls: ` +
      `${usdcToMoney(deal.usdcPerCall)} USDC per call, payable to ${deal.seller}`,
  );

  const usdc = new Contract(USDC_BASE_SEPOLIA, ERC20_ABI, provider);
  const needed = deal.usdcPerCall * BigInt(paidCalls);
  const balance: bigint = await usdc.balanceOf(deal.buyer);
  if (balance < needed) {
    throw new Error(
      `The buyer ${deal.buyer} holds ${usdcToMoney(balance)} USDC and needs ${usdcToMoney(needed)}. ` +
        "Request Base Sepolia USDC for it at https://faucet.circle.com",
    );
  }
  const sellerBefore: bigint = await usdc.balanceOf(deal.seller);

  const server: Server = await new Promise((resolve) => {
    const s = createSellerService(deal, facilitator).listen(PORT, "127.0.0.1", () => resolve(s));
  });
  const base = `http://127.0.0.1:${PORT}`;
  const call = createBuyerClient(keys.buyer as `0x${string}`, deal);

  // The verifier scans this block range for every buyer-to-seller transfer.
  const startBlock = await provider.getBlockNumber();
  const calls: CallResult[] = [];
  let failure: Error | undefined;
  try {
    for (let i = 0; i < paidCalls; i++) {
      const result = await call(`${base}/market-data`);
      calls.push(result);
      console.log(`  call ${i + 1}: ${result.paid ? `paid, tx ${result.transaction}` : `not paid (HTTP ${result.status}) ${result.problem ?? ""}`}`);
      if (!result.paid) throw new Error("a call at the settled price was not paid; stopping");
    }
    const surge = await call(`${base}/market-data-surge`);
    calls.push(surge);
    console.log(`  surge: ${surge.refusal ? `refused: ${surge.refusal}` : "NOT REFUSED (the guard failed)"}`);
    if (!surge.refusal) throw new Error("the buyer did not refuse a price above the settled one");

    // The seller's report is only a claim; each settlement must succeed on-chain.
    for (const c of calls.filter((c) => c.paid)) {
      const receipt = await provider.waitForTransaction(c.transaction!, 1, RECEIPT_TIMEOUT_MS);
      if (!receipt || receipt.status !== 1) throw new Error(`payment ${c.transaction} did not succeed on-chain`);
    }
  } catch (error) {
    failure = error instanceof Error ? error : new Error(String(error));
  } finally {
    server.close();
  }
  const endBlock = await provider.getBlockNumber();
  const sellerAfter: bigint = await usdc.balanceOf(deal.seller);

  const transcript = {
    kind: "x402-payments",
    network: "baseSepolia",
    chainId: 84532,
    contract: deal.contract,
    negotiationId: negotiationId.toString(),
    settledPrice: deal.settledPrice.toString(),
    priceUnit: "US cents per 1,000 API calls",
    usdcPerCall: deal.usdcPerCall.toString(),
    asset: USDC_BASE_SEPOLIA,
    buyer: deal.buyer,
    seller: deal.seller,
    facilitator,
    note: "The buyer pays the seller's API per call over x402. Price and payee are read from the settled negotiation; the buyer refuses any other terms.",
    finishedAt: new Date().toISOString(),
    complete: !failure,
    ...(failure ? { error: failure.message } : {}),
    startBlock,
    endBlock,
    calls,
    sellerUsdcBefore: sellerBefore.toString(),
    sellerUsdcAfter: sellerAfter.toString(),
  };
  const file = `demo-runs/baseSepolia-x402-${negotiationId}.json`;
  fs.writeFileSync(file, JSON.stringify(transcript, null, 2) + "\n");
  console.log(`Seller USDC ${usdcToMoney(sellerBefore)} -> ${usdcToMoney(sellerAfter)} · ${file}`);
  if (failure) throw failure;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
