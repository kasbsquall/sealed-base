import fs from "fs";
import { Contract, Interface, JsonRpcProvider, zeroPadValue } from "ethers";
import { MAX_PAYMENT_WINDOW_SECONDS, readDeal, USDC_BASE_SEPOLIA } from "../agents/x402/deal";
import { SPEND_PERMISSION_MANAGER } from "../agents/x402/baseAccount";
import { getLogsChunked } from "./logs";

/**
 * Independent check of an x402 payment run against Base Sepolia. Needs no
 * wallet. The contract and the USDC address come from this repo, and the
 * price and both wallets from the settled negotiation on-chain; the transcript
 * only says which run to look at.
 *
 *   - every paid call is a distinct, successful transaction inside the run's
 *     block range, moving exactly the settled price per call from the
 *     negotiation's buyer to its seller in USDC;
 *   - no other buyer-to-seller USDC transfer happened in that range or within
 *     the longest window a signed payment stays valid, so a refused call was
 *     not paid behind the transcript's back;
 *   - when the run drew its money from a Base Account, the spend permission is
 *     approved on Base's SpendPermissionManager, its daily allowance covers
 *     exactly the paid calls, and every draw moved exactly one call's price
 *     from the principal's Base Account to the agent.
 *
 *   npx tsx scripts/verify-payments.ts demo-runs/baseSepolia-x402-6.json
 */

const RPC = process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org";
const BASE_SEPOLIA_CHAIN_ID = 84532n;
/** Base produces a block every 2 seconds. */
const BASE_BLOCK_SECONDS = 2;
const TRANSFER = new Interface(["event Transfer(address indexed from, address indexed to, uint256 value)"]);
const TRANSFER_TOPIC = TRANSFER.getEvent("Transfer")!.topicHash;

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const SP = "(address account,address spender,address token,uint160 allowance,uint48 period,uint48 start,uint48 end,uint256 salt,bytes extraData)";
const SPM_ABI = [`function isApproved(${SP} spendPermission) view returns (bool)`];

async function main() {
  const file = process.argv[2] ?? process.env.RUN;
  if (!file) throw new Error("Usage: verify-payments.ts <demo-runs/....json>");
  const run = JSON.parse(fs.readFileSync(file, "utf8"));
  const deployment = JSON.parse(fs.readFileSync("deployments/baseSepolia.json", "utf8"));
  const contract: string = deployment.contracts.SealedNegotiation;
  const provider = new JsonRpcProvider(RPC);
  let failures = 0;
  const check = (ok: boolean, label: string) => {
    console.log(`${ok ? "ok  " : "FAIL"}  ${label}`);
    if (!ok) failures++;
  };

  const { chainId } = await provider.getNetwork();
  if (chainId !== BASE_SEPOLIA_CHAIN_ID) throw new Error(`RPC is on chain ${chainId}, not Base Sepolia`);

  const deal = await readDeal(provider, contract, BigInt(run.negotiationId));
  console.log(`Payments for negotiation ${run.negotiationId}: ${deal.usdcPerCall} atomic USDC per call, read from the contract\n`);
  check(same(run.contract, contract), "transcript names the deployed SealedNegotiation");
  check(same(run.asset, USDC_BASE_SEPOLIA), "transcript names Circle's USDC on Base Sepolia");
  check(same(run.buyer, deal.buyer), "transcript buyer is the negotiation's buyer");
  check(same(run.seller, deal.seller), "transcript seller is the negotiation's seller");
  check(run.complete === true, "the run completed");

  const startBlock = Number(run.startBlock);
  const endBlock = Number(run.endBlock);
  const paid: { transaction: string }[] = run.calls.filter((c: { paid: boolean }) => c.paid);
  const hashes = new Set(paid.map((c) => c.transaction.toLowerCase()));
  check(paid.length > 0, `${paid.length} paid calls in the transcript`);
  check(hashes.size === paid.length, "every paid call has its own transaction");

  for (const [i, c] of paid.entries()) {
    const receipt = await provider.getTransactionReceipt(c.transaction);
    if (!receipt || receipt.status !== 1) {
      check(false, `call ${i + 1}: transaction ${c.transaction} mined and succeeded`);
      continue;
    }
    check(receipt.blockNumber >= startBlock && receipt.blockNumber <= endBlock, `call ${i + 1}: mined inside the run, block ${receipt.blockNumber}`);
    const match = receipt.logs
      .filter((log) => same(log.address, USDC_BASE_SEPOLIA))
      .map((log) => TRANSFER.parseLog(log))
      .find((t) => t?.name === "Transfer" && same(t.args.from, deal.buyer) && same(t.args.to, deal.seller) && t.args.value === deal.usdcPerCall);
    check(!!match, `call ${i + 1}: USDC ${deal.usdcPerCall} from buyer to seller in ${c.transaction}`);
  }

  // A payment signed during the run can settle up to the payment window later.
  const scanTo = endBlock + Math.ceil(MAX_PAYMENT_WINDOW_SECONDS / BASE_BLOCK_SECONDS);
  const latest = await provider.getBlockNumber();
  if (latest < scanTo) {
    check(false, `the payment window has closed (wait ${scanTo - latest} more blocks and run again)`);
  } else {
    const transfers = await getLogsChunked(
      provider,
      { address: USDC_BASE_SEPOLIA, topics: [TRANSFER_TOPIC, zeroPadValue(deal.buyer, 32), zeroPadValue(deal.seller, 32)] },
      startBlock,
      scanTo,
    );
    const unrecorded = transfers.filter((log) => !hashes.has(log.transactionHash.toLowerCase()));
    check(
      transfers.length === paid.length && unrecorded.length === 0,
      `blocks ${startBlock} to ${scanTo}: ${transfers.length} buyer-to-seller USDC transfers, all of them recorded paid calls`,
    );
  }

  const refused = run.calls.filter((c: { refusal?: string }) => c.refusal);
  check(refused.length > 0 && !refused.some((c: { transaction?: string }) => c.transaction), "the over-priced call was refused with no transaction");

  if (run.budget) {
    const b = run.budget;
    const permission = { ...b.permission, allowance: BigInt(b.permission.allowance), salt: BigInt(b.permission.salt) };
    check(same(b.spendPermissionManager, SPEND_PERMISSION_MANAGER), "budget uses Base's SpendPermissionManager");
    check(same(permission.spender, deal.buyer) && same(permission.token, USDC_BASE_SEPOLIA), "the permission lets the negotiation's buyer spend USDC");
    check(permission.allowance === deal.usdcPerCall * BigInt(paid.length), `daily allowance ${permission.allowance} covers exactly the ${paid.length} paid calls`);
    const spm = new Contract(SPEND_PERMISSION_MANAGER, SPM_ABI, provider);
    check(await spm.isApproved(permission), "the permission is approved on-chain");
    const approval = await provider.getTransactionReceipt(b.approveTx);
    check(!!approval && approval.status === 1 && same(approval.to ?? "", SPEND_PERMISSION_MANAGER), `approval ${b.approveTx} succeeded`);
    check(b.draws.length === paid.length, `${b.draws.length} draws for ${paid.length} paid calls`);
    for (const [i, hash] of (b.draws as string[]).entries()) {
      const receipt = await provider.getTransactionReceipt(hash);
      const moved = receipt?.status === 1 && receipt.logs
        .filter((log) => same(log.address, USDC_BASE_SEPOLIA))
        .map((log) => TRANSFER.parseLog(log))
        .some((t) => t?.name === "Transfer" && same(t.args.from, permission.account) && same(t.args.to, deal.buyer) && t.args.value === deal.usdcPerCall);
      check(!!moved, `draw ${i + 1}: USDC ${deal.usdcPerCall} from the Base Account to the agent in ${hash}`);
    }
    check(b.overBudgetDraw?.reverted === true, `transcript records one more draw rejected in simulation: ${b.overBudgetDraw?.reason ?? "not recorded"}`);
  }

  console.log(failures ? `\n${failures} check(s) failed.` : "\nEvery check passed.");
  if (failures) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
