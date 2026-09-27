import fs from "fs";
import { AbiCoder, Interface, JsonRpcProvider } from "ethers";
import { commitmentHash } from "../agents/sealed/commitment";

/**
 * Independent check of a published demo run against the chain. For every round
 * it reads the commit transactions from Base Sepolia and confirms that:
 *
 *   - the transaction was sent by the party the transcript says,
 *   - its calldata carries only the commitment hash, never the offer,
 *   - the hash equals keccak(domain, negotiationId, party, commitIndex, offer, salt)
 *     for the offer and salt the transcript publishes.
 *
 * For a settled run it also checks that the settlement transaction disclosed
 * exactly the last round's offers. Needs no wallet and no Hardhat network.
 *
 *   npx tsx scripts/verify-run.ts demo-runs/baseSepolia-deal-3.json
 *   (or: npx hardhat run scripts/verify-run.ts with RUN=demo-runs/...)
 */

const RPC = process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org";
const SEALED = new Interface([
  "function commitOffer(uint256 negotiationId, bytes32 commitment)",
  "function settle(uint256 negotiationId, (uint256 offer, bytes32 salt) buyerReveal, (uint256 offer, bytes32 salt) sellerReveal, bytes buyerAuthorization, bytes sellerAuthorization)",
]);

async function main() {
  const file = process.argv[2] ?? process.env.RUN;
  if (!file) throw new Error("Usage: verify-run.ts <demo-runs/....json>");
  const run = JSON.parse(fs.readFileSync(file, "utf8"));
  const provider = new JsonRpcProvider(RPC);
  const domain = { chainId: BigInt(run.chainId), verifyingContract: run.contract };
  const negotiationId = BigInt(run.negotiationId);
  let failures = 0;
  const check = (ok: boolean, label: string) => {
    console.log(`${ok ? "ok  " : "FAIL"}  ${label}`);
    if (!ok) failures++;
  };

  console.log(`Run ${file}: negotiation ${negotiationId} on chain ${run.chainId}, outcome ${run.outcome}\n`);
  for (const round of run.rounds) {
    for (const role of ["buyer", "seller"] as const) {
      const side = round[role];
      const tx = await provider.getTransaction(side.commitTx);
      if (!tx) {
        check(false, `round ${round.round} ${role}: commit tx not found`);
        continue;
      }
      const decoded = SEALED.parseTransaction({ data: tx.data });
      const onChainCommitment = decoded?.args.commitment as string;
      const recomputed = commitmentHash({
        domain,
        negotiationId,
        party: run.agents[role].wallet,
        commitIndex: side.commitIndex,
        position: { offer: BigInt(side.offer), salt: side.salt },
      });
      const offerWord = AbiCoder.defaultAbiCoder().encode(["uint256"], [BigInt(side.offer)]).slice(2);

      check(tx.from.toLowerCase() === run.agents[role].wallet.toLowerCase(), `round ${round.round} ${role}: sent by the ${role}'s wallet`);
      check(tx.to?.toLowerCase() === run.contract.toLowerCase() && decoded?.name === "commitOffer", `round ${round.round} ${role}: a commitOffer call to Sealed`);
      check(!tx.data.toLowerCase().includes(offerWord), `round ${round.round} ${role}: offer ${side.offer} absent from calldata`);
      check(onChainCommitment === recomputed, `round ${round.round} ${role}: on-chain hash matches offer ${side.offer} with the published salt`);
    }
  }

  if (run.outcome === "settled") {
    const tx = await provider.getTransaction(run.settleTx);
    const decoded = tx && SEALED.parseTransaction({ data: tx.data });
    const last = run.rounds.at(-1);
    check(!!decoded && decoded.name === "settle", "settlement is a settle call to Sealed");
    check(decoded?.args.buyerReveal.offer === BigInt(last.buyer.offer), `settlement disclosed buyer offer ${last.buyer.offer}`);
    check(decoded?.args.sellerReveal.offer === BigInt(last.seller.offer), `settlement disclosed seller offer ${last.seller.offer}`);
  } else {
    check(!!run.expireTx, "negotiation was closed with expire, disclosing nothing");
  }

  console.log(failures ? `\n${failures} check(s) failed.` : "\nEvery check passed.");
  if (failures) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
