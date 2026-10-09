import { hexlify, randomBytes } from "ethers";
import { commitmentHash as agentHash } from "../agents/sealed/commitment";
import { commitmentHash as webHash, domainSeparator } from "../web/src/lib/commitment";

/**
 * The judge page's practice negotiation seals offers in the browser with its own
 * keccak code. This checks it against the agents' ethers implementation, which
 * test/commitment.test.ts already checks against the deployed contract.
 *
 * Run from the repo root: NODE_PATH=web/node_modules npx tsx scripts/check-web-commitment.ts
 */
const chainId = 84532;
const verifyingContract = "0x0C0E12C9C77FAcDa9302514A818DF232346e773A";
const domain = domainSeparator(chainId, verifyingContract);

let checked = 0;
for (let i = 0; i < 200; i++) {
  const party = hexlify(randomBytes(20));
  const salt = hexlify(randomBytes(32));
  const offer = i === 0 ? 0n : i === 1 ? 2n ** 256n - 1n : BigInt(Math.floor(Math.random() * 1e9));
  const negotiationId = BigInt(i);
  const commitIndex = i % 7;
  const a = agentHash({ domain: { chainId, verifyingContract }, negotiationId, party, commitIndex, position: { offer, salt } });
  const b = webHash({ domain, negotiationId, party, commitIndex, offer, salt });
  if (a !== b) throw new Error(`mismatch at case ${i}: ${a} vs ${b}`);
  checked++;
}
console.log(`web commitment matches the agents' implementation in ${checked} cases`);
