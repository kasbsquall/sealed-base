import "dotenv/config";
import fs from "fs";
import type { Server } from "http";
import { Contract, JsonRpcProvider, Wallet } from "ethers";
import { readDeal, USDC_BASE_SEPOLIA, usdcToMoney } from "../agents/x402/deal";
import { createSellerService, DEFAULT_FACILITATOR } from "../agents/x402/sellerService";
import { createBuyerClient, type CallResult } from "../agents/x402/buyerClient";
import { openBudget, principalBaseAccount } from "../agents/x402/baseAccount";
import { getLogsChunked } from "./logs";

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
 *
 * With BUDGET=base-account the money comes from the principal's Base Account
 * instead of the agent's own wallet. The agent's USDC is first moved there, so
 * the agent holds nothing of its own; the principal grants it a Spend
 * Permission of exactly PAID_CALLS calls per day, the agent draws each call's
 * price before paying, and one more draw is shown to revert on-chain.
 * Writes demo-runs/<network>-x402-<negotiationId>-base-account.json.
 */

const RPC = process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org";
const PORT = 4021;
const RECEIPT_TIMEOUT_MS = 120_000;
const POLL_MS = 1_000;
const PAYMENT_RETRIES = 2;
const RETRY_DELAY_MS = 4_000;
const POLL_TRIES = 30;

/**
 * The public Base Sepolia RPC is load-balanced, and a node can answer from a
 * block before our last transaction. Wait until a read reflects it.
 */
async function waitFor(label: string, ready: () => Promise<boolean>) {
  for (let i = 0; i < POLL_TRIES; i++) {
    if (await ready()) return;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new Error(`timed out waiting for ${label}`);
}
const ERC20_ABI = ["function balanceOf(address) view returns (uint256)", "function transfer(address to, uint256 value) returns (bool)", "event Transfer(address indexed from, address indexed to, uint256 value)"];
/** How far back to look for the transfer that funded the Base Account, about an hour of Base blocks. */
const FUND_LOOKBACK_BLOCKS = 1_800;

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
  const useBaseAccount = process.env.BUDGET === "base-account";

  let budget: Awaited<ReturnType<typeof openBudget>> | undefined;
  let fundTx: string | undefined;
  if (useBaseAccount) {
    if (!keys.principal) {
      keys.principal = Wallet.createRandom().privateKey;
      fs.writeFileSync(".demo-wallets.json", JSON.stringify(keys, null, 2) + "\n");
    }
    const account = (await principalBaseAccount(RPC, keys.principal)).address;
    // The agent keeps nothing of its own: everything it holds goes to the principal's account.
    const agentBalance: bigint = await usdc.balanceOf(deal.buyer);
    if (agentBalance > 0n) {
      const sent = await (usdc.connect(new Wallet(keys.buyer, provider)) as Contract).transfer(account, agentBalance);
      fundTx = sent.hash;
      await sent.wait();
    } else {
      // Funded by an earlier run: record the transfer that moved the agent's USDC to the account.
      const recent = await provider.getBlockNumber();
      const transfer = await usdc.filters.Transfer(deal.buyer, account).getTopicFilter();
      const logs = await getLogsChunked(provider, { address: USDC_BASE_SEPOLIA, topics: transfer }, recent - FUND_LOOKBACK_BLOCKS, recent);
      fundTx = logs.at(-1)?.transactionHash;
    }
    await waitFor("the Base Account balance", async () => (await usdc.balanceOf(account)) >= needed);
    const accountBalance: bigint = await usdc.balanceOf(account);
    if (accountBalance < needed) throw new Error(`The principal's Base Account ${account} holds ${usdcToMoney(accountBalance)} USDC and needs ${usdcToMoney(needed)}.`);
    budget = await openBudget(RPC, keys.principal, keys.buyer, needed);
    console.log(`Base Account ${account} lets the agent draw ${usdcToMoney(needed)} USDC per day (approval ${budget.approveTx})`);
  } else {
    const balance: bigint = await usdc.balanceOf(deal.buyer);
    if (balance < needed) {
      throw new Error(
        `The buyer ${deal.buyer} holds ${usdcToMoney(balance)} USDC and needs ${usdcToMoney(needed)}. ` +
          "Request Base Sepolia USDC for it at https://faucet.circle.com",
      );
    }
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
  const draws: string[] = [];
  let overBudget: string | undefined;
  let failure: Error | undefined;
  try {
    for (let i = 0; i < paidCalls; i++) {
      if (budget) {
        draws.push(await budget.draw(deal.usdcPerCall));
        // The facilitator checks the agent's balance before settling; make sure the draw is visible.
        await waitFor("the drawn USDC", async () => (await usdc.balanceOf(deal.buyer)) >= deal.usdcPerCall);
        console.log(`  draw ${i + 1}: ${usdcToMoney(deal.usdcPerCall)} from the Base Account, tx ${draws.at(-1)}`);
      }
      // The facilitator reads balances from its own node, which can lag behind a draw.
      // An honest call that is rejected is retried; every attempt stays in the transcript.
      let result = await call(`${base}/market-data`);
      calls.push(result);
      for (let attempt = 1; !result.paid && result.status === 402 && attempt <= PAYMENT_RETRIES; attempt++) {
        console.log(`  call ${i + 1}: rejected (${result.problem ?? "no reason"}), retrying`);
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        result = await call(`${base}/market-data`);
        calls.push(result);
      }
      console.log(`  call ${i + 1}: ${result.paid ? `paid, tx ${result.transaction}` : `not paid (HTTP ${result.status}) ${result.problem ?? ""}`}`);
      if (!result.paid) throw new Error("a call at the settled price was not paid; stopping");
    }
    const surge = await call(`${base}/market-data-surge`);
    calls.push(surge);
    console.log(`  surge: ${surge.refusal ? `refused: ${surge.refusal}` : "NOT REFUSED (the guard failed)"}`);
    if (!surge.refusal) throw new Error("the buyer did not refuse a price above the settled one");
    if (budget) {
      overBudget = await budget.simulateDraw(deal.usdcPerCall);
      console.log(`  one more draw: ${overBudget ? `reverts: ${overBudget}` : "WOULD PASS (the budget is not enforced)"}`);
      if (!overBudget) throw new Error("a draw past the daily budget would have passed");
    }

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
    ...(budget
      ? {
          budget: {
            kind: "base-account-spend-permission",
            note: "The principal's USDC sits in a Base Account. The agent may draw at most the allowance per period, enforced by Base's SpendPermissionManager; the agent held no USDC of its own before the first draw.",
            baseAccount: budget.account,
            spendPermissionManager: "0xf85210B21cC50302F477BA56686d2019dC9b67Ad",
            permission: { ...budget.permission, allowance: budget.permission.allowance.toString(), salt: budget.permission.salt.toString() },
            fundTx,
            approveTx: budget.approveTx,
            draws,
            overBudgetDraw: overBudget ? { simulated: true, reverted: true, reason: overBudget } : undefined,
          },
        }
      : {}),
  };
  const file = `demo-runs/baseSepolia-x402-${negotiationId}${budget ? "-base-account" : ""}.json`;
  fs.writeFileSync(file, JSON.stringify(transcript, null, 2) + "\n");
  console.log(`Seller USDC ${usdcToMoney(sellerBefore)} -> ${usdcToMoney(sellerAfter)} · ${file}`);
  if (failure) throw failure;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
