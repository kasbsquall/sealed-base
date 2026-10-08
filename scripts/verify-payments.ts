import fs from "fs";
import { Interface, JsonRpcProvider } from "ethers";
import { readDeal } from "../agents/x402/deal";

/**
 * Independent check of an x402 payment run against Base Sepolia. Needs no
 * wallet. For every paid call it reads the transaction receipt and confirms a
 * USDC transfer from the negotiation's buyer to its seller of exactly the
 * settled price per call, with the price and both wallets read from the
 * SealedNegotiation contract rather than from the transcript.
 *
 *   npx tsx scripts/verify-payments.ts demo-runs/baseSepolia-x402-6.json
 */

const RPC = process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org";
const TRANSFER = new Interface(["event Transfer(address indexed from, address indexed to, uint256 value)"]);

async function main() {
  const file = process.argv[2] ?? process.env.RUN;
  if (!file) throw new Error("Usage: verify-payments.ts <demo-runs/....json>");
  const run = JSON.parse(fs.readFileSync(file, "utf8"));
  const provider = new JsonRpcProvider(RPC);
  let failures = 0;
  const check = (ok: boolean, label: string) => {
    console.log(`${ok ? "ok  " : "FAIL"}  ${label}`);
    if (!ok) failures++;
  };

  const deal = await readDeal(provider, run.contract, BigInt(run.negotiationId));
  console.log(`Payments for negotiation ${run.negotiationId}: ${deal.usdcPerCall} atomic USDC per call, read from the contract\n`);
  check(deal.buyer.toLowerCase() === run.buyer.toLowerCase(), "transcript buyer is the negotiation's buyer");
  check(deal.seller.toLowerCase() === run.seller.toLowerCase(), "transcript seller is the negotiation's seller");

  const paid = run.calls.filter((c: { paid: boolean }) => c.paid);
  check(paid.length > 0, `${paid.length} paid calls in the transcript`);
  for (const [i, c] of paid.entries()) {
    const receipt = await provider.getTransactionReceipt(c.transaction);
    if (!receipt || receipt.status !== 1) {
      check(false, `call ${i + 1}: transaction ${c.transaction} mined and succeeded`);
      continue;
    }
    const transfers = receipt.logs
      .filter((log) => log.address.toLowerCase() === run.asset.toLowerCase())
      .map((log) => TRANSFER.parseLog(log))
      .filter((parsed) => parsed?.name === "Transfer");
    const match = transfers.find(
      (t) =>
        t!.args.from.toLowerCase() === deal.buyer.toLowerCase() &&
        t!.args.to.toLowerCase() === deal.seller.toLowerCase() &&
        t!.args.value === deal.usdcPerCall,
    );
    check(!!match, `call ${i + 1}: USDC ${deal.usdcPerCall} from buyer to seller in ${c.transaction}`);
  }

  const refused = run.calls.filter((c: { paid: boolean; refusal?: string }) => !c.paid && c.refusal);
  check(refused.length > 0 && !refused.some((c: { transaction?: string }) => c.transaction), "the over-priced call was refused with no transaction");

  console.log(failures ? `\n${failures} check(s) failed.` : "\nEvery check passed.");
  if (failures) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
