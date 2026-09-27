import fs from "fs";
import { ethers, network } from "hardhat";
import { Wallet } from "ethers";
import { PrivyClient } from "@privy-io/node";
import { createSealedMandate } from "../agents/privy/mandate";
import { AgentWallet, provisionAgentWallet } from "../agents/privy/agentWallet";
import { NegotiatorAgent } from "../agents/negotiator/negotiator";
import { ClearingRelay } from "../agents/relay/clearingRelay";
import { OpenAICompatibleClient, llmConfigFromEnv } from "../agents/llm/client";
import { REGISTRIES } from "./registries";
import { fees } from "./fees";

/**
 * Runs Sealed with Privy server wallets as the two parties, on a live network.
 *
 *   1. creates the mandate policy: the wallet may only call SealedNegotiation,
 *      sign EIP-712 payloads for it, and call `register` on the ERC-8004
 *      Identity Registry,
 *   2. provisions a buyer and a seller wallet already bound to that policy,
 *   3. funds them with gas and has each register its own ERC-8004 identity,
 *   4. has the demo reviewers leave feedback so both clear the admission policy
 *      (seeded reputation, labelled as such),
 *   5. asks Privy to send 1 wei from the buyer wallet to the relay, which the
 *      mandate must refuse,
 *   6. runs one LLM negotiation where every commit and every settlement
 *      authorization is signed by Privy.
 *
 * Idempotent: state is saved to deployments/privy-<network>.json after every
 * step, and a re-run resumes. That file holds ids and addresses, no secrets.
 *
 *   npx hardhat run scripts/privy-demo.ts --network baseSepolia
 */

const TERMS = "Demo: price per 1,000 calls to a market-data API, 30-day term, in US cents";
const UNIT = "US cents per 1,000 API calls";
const REFERENCE = 4000n;
const MAX_ROUNDS = 3;
const LIMITS = { buyer: 4300n, seller: 4100n };
const FUNDING = ethers.parseEther("0.0003");
const FEEDBACK = { buyer: [480, 460, 470, 490, 450, 470], seller: [440, 430, 450, 420, 460, 430] };
const REVIEWERS = ["reviewerA", "reviewerB", "reviewerC"] as const;
const ROLES = ["buyer", "seller"] as const;
type PartyRole = (typeof ROLES)[number];

interface PrivyState {
  policyId?: string;
  wallets: Partial<Record<PartyRole, { walletId: string; address: string; agentId?: string; registerTx?: string; feedback?: string[] }>>;
  mandateProbe?: { attempted: string; refused: boolean; response: string };
  negotiations: string[];
}

function env(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing ${key} in .env. See .env.example.`);
  return value;
}

async function main() {
  const privy = new PrivyClient({ appId: env("PRIVY_APP_ID"), appSecret: env("PRIVY_APP_SECRET") });
  const ownerId = env("PRIVY_KEY_QUORUM_ID");
  const authorizationPrivateKey = env("PRIVY_AUTHORIZATION_KEY");
  const relayer = new Wallet(env("DEPLOYER_PRIVATE_KEY"), ethers.provider);

  const deployment = JSON.parse(fs.readFileSync(`deployments/${network.name}.json`, "utf8"));
  const demoKeys = JSON.parse(fs.readFileSync(".demo-wallets.json", "utf8"));
  const chainId = Number(deployment.chainId);
  const registries = REGISTRIES[chainId];
  const domain = { chainId: BigInt(chainId), verifyingContract: deployment.contracts.SealedNegotiation as string };

  const stateFile = `deployments/privy-${network.name}.json`;
  const state: PrivyState = fs.existsSync(stateFile)
    ? JSON.parse(fs.readFileSync(stateFile, "utf8"))
    : { wallets: {}, negotiations: [] };
  const save = () => fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + "\n");

  // 1. Mandate
  if (!state.policyId) {
    const policy = await createSealedMandate(privy, {
      sealedAddress: domain.verifyingContract,
      chainId,
      ownerId,
      identityRegistry: registries.identity,
    });
    state.policyId = policy.id;
    save();
  }
  console.log(`Mandate policy ${state.policyId}`);

  // 2-3. Wallets, gas, identities
  const agentWallets = {} as Record<PartyRole, AgentWallet>;
  const identity = await ethers.getContractAt("IdentityRegistryUpgradeable", registries.identity);
  for (const role of ROLES) {
    if (!state.wallets[role]) {
      const created = await provisionAgentWallet(privy, {
        ownerId,
        policyId: state.policyId!,
        displayName: `Sealed ${role} agent`,
      });
      state.wallets[role] = { walletId: created.id, address: created.address };
      save();
    }
    const record = state.wallets[role]!;
    agentWallets[role] = new AgentWallet({
      privy,
      walletId: record.walletId,
      address: record.address,
      domain,
      authorizationPrivateKey,
      provider: ethers.provider,
    });

    if ((await ethers.provider.getBalance(record.address)) < FUNDING / 3n) {
      const tx = await relayer.sendTransaction({ to: record.address, value: FUNDING, ...(await fees()) });
      await tx.wait();
      console.log(`  funded ${role} ${record.address} · ${tx.hash}`);
    }

    if (!record.agentId) {
      const uri = `data:application/json,${encodeURIComponent(
        JSON.stringify({
          type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
          name: `Sealed demo ${role} (Privy)`,
          description: `Demo ${role} agent for Sealed whose wallet is a Privy server wallet under the Sealed mandate.`,
        }),
      )}`;
      const txHash = await agentWallets[role].registerAgent(registries.identity, uri);
      const receipt = await ethers.provider.getTransactionReceipt(txHash);
      const event = receipt!.logs
        .map((log) => {
          try {
            return identity.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsed) => parsed?.name === "Registered");
      if (!event) throw new Error(`No Registered event for ${role}`);
      record.agentId = event.args.agentId.toString();
      record.registerTx = txHash;
      save();
    }
    console.log(`  ${role} wallet ${record.address} · ERC-8004 agent #${record.agentId}`);
  }

  // 4. Seeded reputation from the demo reviewers
  const reputation = await ethers.getContractAt("ReputationRegistryUpgradeable", registries.reputation);
  for (const role of ROLES) {
    const record = state.wallets[role]!;
    record.feedback ??= [];
    for (let i = record.feedback.length; i < FEEDBACK[role].length; i++) {
      const reviewer = new Wallet(demoKeys[REVIEWERS[i % REVIEWERS.length]], ethers.provider);
      const tx = await reputation
        .connect(reviewer)
        .giveFeedback(BigInt(record.agentId!), FEEDBACK[role][i], 2, "", "", "", "", ethers.ZeroHash, await fees());
      await tx.wait();
      record.feedback.push(tx.hash);
      save();
    }
  }
  const gate = await ethers.getContractAt("ReputationGate", deployment.contracts.ReputationGate);
  for (const role of ROLES) {
    const clears = await gate.clears(BigInt(state.wallets[role]!.agentId!), deployment.policy);
    console.log(`  ${role} clears the admission policy: ${clears}`);
    if (!clears) throw new Error(`${role} does not clear the policy`);
  }

  // 5. The mandate must refuse anything outside Sealed
  if (!state.mandateProbe) {
    const attempted = `send 1 wei from the buyer wallet to ${relayer.address}`;
    try {
      const { hash } = await privy.wallets().ethereum().sendTransaction(state.wallets.buyer!.walletId, {
        caip2: `eip155:${chainId}`,
        params: { transaction: { to: relayer.address, value: "0x1", chain_id: chainId } },
        authorization_context: { authorization_private_keys: [authorizationPrivateKey] },
      });
      state.mandateProbe = { attempted, refused: false, response: `sent ${hash}` };
    } catch (error) {
      state.mandateProbe = { attempted, refused: true, response: String(error).slice(0, 400) };
    }
    save();
  }
  console.log(`  mandate probe (${state.mandateProbe.attempted}): ${state.mandateProbe.refused ? "refused" : "NOT refused"}`);
  if (!state.mandateProbe.refused) throw new Error("The mandate allowed a transfer. Stop and fix the policy.");

  // 6. One negotiation signed end to end by Privy
  const llmConfig = llmConfigFromEnv();
  const relay = new ClearingRelay(relayer, domain);
  const agent = (role: PartyRole) =>
    new NegotiatorAgent(
      role,
      { role, limit: LIMITS[role], reference: REFERENCE, maxRounds: MAX_ROUNDS, unit: UNIT },
      agentWallets[role],
      new OpenAICompatibleClient(llmConfig),
      domain,
    );
  const buyer = agent("buyer");
  const seller = agent("seller");

  console.log(`\nNegotiating with Privy wallets · model ${llmConfig.model}`);
  const startedAt = new Date().toISOString();
  const record = await relay.negotiate({
    buyer: { agent: buyer, agentId: BigInt(state.wallets.buyer!.agentId!) },
    seller: { agent: seller, agentId: BigInt(state.wallets.seller!.agentId!) },
    termsSchema: ethers.id(TERMS),
    policy: deployment.policy,
    maxRounds: MAX_ROUNDS,
    windowSeconds: 900,
    onEvent: (m) => console.log(`  ${m}`),
  });

  const transcript = {
    scenario: "deal",
    network: network.name,
    chainId,
    contract: domain.verifyingContract,
    relay: relayer.address,
    model: llmConfig.model,
    modelHost: llmConfig.baseUrl.includes("localhost") ? "local (Ollama on the operator's machine)" : llmConfig.baseUrl,
    wallets: `Privy server wallets under mandate policy ${state.policyId}. Every commit and settlement authorization was signed by Privy.`,
    terms: TERMS,
    termsSchema: ethers.id(TERMS),
    referencePrice: REFERENCE.toString(),
    disclosure: "Demo only: mandates, offers, stances and salts are published so every on-chain hash can be recomputed. A real agent never discloses them.",
    agents: {
      buyer: { agentId: state.wallets.buyer!.agentId, wallet: buyer.wallet.address, limit: LIMITS.buyer.toString() },
      seller: { agentId: state.wallets.seller!.agentId, wallet: seller.wallet.address, limit: LIMITS.seller.toString() },
    },
    startedAt,
    finishedAt: new Date().toISOString(),
    ...record,
  };
  const file = `demo-runs/${network.name}-privy-deal-${record.negotiationId}.json`;
  fs.writeFileSync(file, JSON.stringify(transcript, null, 2) + "\n");
  state.negotiations.push(record.negotiationId);
  save();
  console.log(`  outcome ${record.outcome}${record.settledPrice ? ` at ${record.settledPrice}` : ""} · ${file}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
