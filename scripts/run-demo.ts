import fs from "fs";
import { ethers, network } from "hardhat";
import { Wallet } from "ethers";
import { NegotiatorAgent, type Mandate } from "../agents/negotiator/negotiator";
import { ClearingRelay } from "../agents/relay/clearingRelay";
import { LocalPartyWallet } from "../agents/wallets/partyWallet";
import { OpenAICompatibleClient, llmConfigFromEnv } from "../agents/llm/client";

/**
 * Runs the two demo negotiations on a live network with real LLM agents:
 *
 *   deal     the mandates overlap, so the agents can find a price both accept
 *   no-deal  the mandates cannot overlap, so the negotiation expires and neither
 *            number ever reaches the chain
 *
 * Each agent decides with its own model call and only its own mandate. The
 * transcript, written to demo-runs/, publishes the mandates, offers and salts
 * on purpose so anyone can recompute every on-chain hash. A real agent would
 * never disclose any of it.
 *
 *   npx hardhat run scripts/run-demo.ts --network baseSepolia
 *   DEMO_SCENARIOS=deal npx hardhat run ...     (run only one)
 */

const TERMS = "Demo: price per 1,000 calls to a market-data API, 30-day term, in US cents";
const UNIT = "US cents per 1,000 API calls";
const REFERENCE = 4000n;
const MAX_ROUNDS = 3;

const SCENARIOS = {
  deal: { buyerLimit: 4300n, sellerLimit: 4100n, windowSeconds: 900 },
  "no-deal": { buyerLimit: 3600n, sellerLimit: 4300n, windowSeconds: 150 },
} as const;
type ScenarioName = keyof typeof SCENARIOS;

async function main() {
  const state = JSON.parse(fs.readFileSync(`deployments/${network.name}.json`, "utf8"));
  const keys = JSON.parse(fs.readFileSync(".demo-wallets.json", "utf8"));
  if (!process.env.DEPLOYER_PRIVATE_KEY) throw new Error("DEPLOYER_PRIVATE_KEY missing; the relay pays gas with it.");

  const domain = { chainId: BigInt(state.chainId), verifyingContract: state.contracts.SealedNegotiation };
  const llmConfig = llmConfigFromEnv();
  const relayer = new Wallet(process.env.DEPLOYER_PRIVATE_KEY, ethers.provider);
  // On a local fork the clock only moves when blocks are mined, so waiting for a
  // deadline means jumping time instead of sleeping.
  const relay =
    network.name === "hardhat"
      ? new ClearingRelay(relayer, domain, async (ms) => {
          await ethers.provider.send("evm_increaseTime", [Math.ceil(ms / 1000)]);
          await ethers.provider.send("evm_mine", []);
        })
      : new ClearingRelay(relayer, domain);
  const selected = (process.env.DEMO_SCENARIOS?.split(",") ?? Object.keys(SCENARIOS)) as ScenarioName[];

  fs.mkdirSync("demo-runs", { recursive: true });
  console.log(`Network ${network.name} · model ${llmConfig.model} at ${llmConfig.baseUrl}`);

  for (const name of selected) {
    const scenario = SCENARIOS[name];
    const mandate = (role: "buyer" | "seller", limit: bigint): Mandate => ({
      role,
      limit,
      reference: REFERENCE,
      maxRounds: MAX_ROUNDS,
      unit: UNIT,
    });
    // Each agent gets its own client: nothing is shared between the two sides.
    const buyer = new NegotiatorAgent(
      "buyer",
      mandate("buyer", scenario.buyerLimit),
      new LocalPartyWallet(new Wallet(keys.buyer, ethers.provider), domain),
      new OpenAICompatibleClient(llmConfig),
      domain,
    );
    const seller = new NegotiatorAgent(
      "seller",
      mandate("seller", scenario.sellerLimit),
      new LocalPartyWallet(new Wallet(keys.seller, ethers.provider), domain),
      new OpenAICompatibleClient(llmConfig),
      domain,
    );

    console.log(`\n== ${name}: buyer limit ${scenario.buyerLimit}, seller limit ${scenario.sellerLimit}`);
    const startedAt = new Date().toISOString();
    const record = await relay.negotiate({
      buyer: { agent: buyer, agentId: BigInt(state.agents.buyer.agentId) },
      seller: { agent: seller, agentId: BigInt(state.agents.seller.agentId) },
      termsSchema: ethers.id(TERMS),
      policy: state.policy,
      maxRounds: MAX_ROUNDS,
      windowSeconds: scenario.windowSeconds,
      onEvent: (m) => console.log(`  ${m}`),
    });
    for (const r of record.rounds) {
      console.log(`  round ${r.round}: buyer ${r.buyer.offer}${r.buyer.correction ? ` (model said ${r.buyer.proposedOffer})` : ""}, seller ${r.seller.offer}${r.seller.correction ? ` (model said ${r.seller.proposedOffer})` : ""}, crossed ${r.crossed}`);
    }

    const transcript = {
      scenario: name,
      network: network.name,
      chainId: state.chainId,
      contract: state.contracts.SealedNegotiation,
      relay: relayer.address,
      model: llmConfig.model,
      modelHost: llmConfig.baseUrl.includes("localhost") ? "local (Ollama on the operator's machine)" : llmConfig.baseUrl,
      terms: TERMS,
      termsSchema: ethers.id(TERMS),
      referencePrice: REFERENCE.toString(),
      disclosure: "Demo only: mandates, offers, salts and reasoning are published so every on-chain hash can be recomputed. A real agent never discloses them.",
      agents: {
        buyer: { agentId: state.agents.buyer.agentId, wallet: buyer.wallet.address, limit: scenario.buyerLimit.toString() },
        seller: { agentId: state.agents.seller.agentId, wallet: seller.wallet.address, limit: scenario.sellerLimit.toString() },
      },
      startedAt,
      finishedAt: new Date().toISOString(),
      ...record,
    };
    const file = `demo-runs/${network.name}-${name}-${record.negotiationId}.json`;
    fs.writeFileSync(file, JSON.stringify(transcript, null, 2) + "\n");
    console.log(`  outcome ${record.outcome}${record.settledPrice ? ` at ${record.settledPrice}` : ""} · ${file}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
