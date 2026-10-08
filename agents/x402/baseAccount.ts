import { BaseError, ContractFunctionRevertedError, createPublicClient, createWalletClient, http, parseAbi, type Hex } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { toCoinbaseSmartAccount } from "viem/account-abstraction";
import { USDC_BASE_SEPOLIA } from "./deal";

/**
 * The principal's budget lives in a Base Account (Coinbase Smart Wallet), not in
 * the agent's wallet. The principal grants the buyer agent a Spend Permission:
 * at most `allowance` USDC per period, enforced by Base's SpendPermissionManager.
 * The agent draws exactly what each paid call costs, so a jailbroken or buggy
 * agent still cannot take more than the principal allowed.
 *
 * Addresses and ABI: coinbase/spend-permissions, SpendPermissionManager.sol;
 * both contracts verified with eth_getCode on Base Sepolia on 2026-10-08.
 */

export const SPEND_PERMISSION_MANAGER = "0xf85210B21cC50302F477BA56686d2019dC9b67Ad" as const;
/** CoinbaseSmartWalletFactory v1.1 on Base Sepolia. */
export const SMART_WALLET_FACTORY = "0xBA5ED110eFDBa3D005bfC882d75358ACBbB85842" as const;

const SP = "(address account,address spender,address token,uint160 allowance,uint48 period,uint48 start,uint48 end,uint256 salt,bytes extraData)";
export const SPM_ABI = parseAbi([
  `function approveWithSignature(${SP} spendPermission, bytes signature) returns (bool)`,
  `function spend(${SP} spendPermission, uint160 value)`,
  `function isApproved(${SP} spendPermission) view returns (bool)`,
  `function getCurrentPeriod(${SP} spendPermission) view returns ((uint48 start, uint48 end, uint160 spend))`,
  "error ExceededSpendPermission(uint256 value, uint256 allowance)",
]);

const SPEND_PERMISSION_TYPES = {
  SpendPermission: [
    { name: "account", type: "address" },
    { name: "spender", type: "address" },
    { name: "token", type: "address" },
    { name: "allowance", type: "uint160" },
    { name: "period", type: "uint48" },
    { name: "start", type: "uint48" },
    { name: "end", type: "uint48" },
    { name: "salt", type: "uint256" },
    { name: "extraData", type: "bytes" },
  ],
} as const;

export interface SpendPermission {
  account: `0x${string}`;
  spender: `0x${string}`;
  token: `0x${string}`;
  allowance: bigint;
  period: number;
  start: number;
  end: number;
  salt: bigint;
  extraData: Hex;
}

const DAY_SECONDS = 86_400;
const VALID_DAYS = 30;
/** Start slightly in the past so the first period is already open. */
const START_SLACK_SECONDS = 60;
const APPROVAL_POLL_MS = 1_000;
const APPROVAL_POLL_TRIES = 30;
/**
 * A draw uses about 124k gas. A lagging RPC node once estimated 111k and the
 * draw ran out of gas on-chain, so draws carry a fixed limit with margin.
 */
const DRAW_GAS_LIMIT = 250_000n;

export function clients(rpcUrl: string) {
  const transport = http(rpcUrl);
  return { publicClient: createPublicClient({ chain: baseSepolia, transport }), transport };
}

/** The principal's Base Account: owned by its key, with the manager as second owner so `spend` can move funds. */
export async function principalBaseAccount(rpcUrl: string, principalKey: Hex) {
  const { publicClient } = clients(rpcUrl);
  return toCoinbaseSmartAccount({
    client: publicClient,
    owners: [privateKeyToAccount(principalKey), SPEND_PERMISSION_MANAGER],
    version: "1.1",
    nonce: 0n,
  });
}

/**
 * Opens a daily USDC budget for the buyer agent on the principal's Base Account.
 * The principal only signs; the agent submits the approval and every draw, and
 * pays their gas.
 */
export async function openBudget(rpcUrl: string, principalKey: Hex, agentKey: Hex, allowancePerDay: bigint) {
  const { publicClient, transport } = clients(rpcUrl);
  const account = await principalBaseAccount(rpcUrl, principalKey);
  const agent = privateKeyToAccount(agentKey);
  const agentWallet = createWalletClient({ account: agent, chain: baseSepolia, transport });
  const now = Number((await publicClient.getBlock()).timestamp);

  const permission: SpendPermission = {
    account: account.address,
    spender: agent.address,
    token: USDC_BASE_SEPOLIA,
    allowance: allowancePerDay,
    period: DAY_SECONDS,
    start: now - START_SLACK_SECONDS,
    end: now + VALID_DAYS * DAY_SECONDS,
    salt: BigInt(now),
    extraData: "0x",
  };
  // Wrapped for the smart wallet (ERC-1271), and in ERC-6492 form while it is
  // not deployed yet; the manager deploys it during approval.
  const signature = await account.signTypedData({
    domain: { name: "Spend Permission Manager", version: "1", chainId: baseSepolia.id, verifyingContract: SPEND_PERMISSION_MANAGER },
    types: SPEND_PERMISSION_TYPES,
    primaryType: "SpendPermission",
    message: permission,
  });

  const approveTx = await agentWallet.writeContract({
    address: SPEND_PERMISSION_MANAGER,
    abi: SPM_ABI,
    functionName: "approveWithSignature",
    args: [permission, signature],
  });
  const approval = await publicClient.waitForTransactionReceipt({ hash: approveTx });
  if (approval.status !== "success") throw new Error(`spend permission approval ${approveTx} failed`);
  // A load-balanced RPC node may still answer from before the approval.
  for (let i = 0; ; i++) {
    const approved = await publicClient.readContract({ address: SPEND_PERMISSION_MANAGER, abi: SPM_ABI, functionName: "isApproved", args: [permission] });
    if (approved) break;
    if (i >= APPROVAL_POLL_TRIES) throw new Error("the approval is mined but not yet visible on the RPC");
    await new Promise((r) => setTimeout(r, APPROVAL_POLL_MS));
  }

  return {
    account: account.address,
    permission,
    approveTx,
    /** Pulls `amount` USDC from the principal's Base Account into the agent's wallet. */
    async draw(amount: bigint): Promise<Hex> {
      const hash = await agentWallet.writeContract({ address: SPEND_PERMISSION_MANAGER, abi: SPM_ABI, functionName: "spend", args: [permission, amount], gas: DRAW_GAS_LIMIT });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`draw ${hash} failed`);
      return hash;
    },
    /** Asks the chain, without a transaction, whether one more draw would pass. Returns the revert reason when it would not. */
    async simulateDraw(amount: bigint): Promise<string | undefined> {
      try {
        await publicClient.simulateContract({ account: agent, address: SPEND_PERMISSION_MANAGER, abi: SPM_ABI, functionName: "spend", args: [permission, amount] });
        return undefined;
      } catch (error) {
        // Name the contract's own error, e.g. ExceededSpendPermission(168000, 126000).
        const reverted = error instanceof BaseError ? error.walk((e) => e instanceof ContractFunctionRevertedError) : undefined;
        if (reverted instanceof ContractFunctionRevertedError && reverted.data?.errorName) {
          return `${reverted.data.errorName}(${(reverted.data.args ?? []).map(String).join(", ")})`;
        }
        const e = error as { shortMessage?: string; message: string };
        return e.shortMessage ?? e.message.split("\n")[0];
      }
    },
    async spentThisPeriod(): Promise<bigint> {
      const period = await publicClient.readContract({ address: SPEND_PERMISSION_MANAGER, abi: SPM_ABI, functionName: "getCurrentPeriod", args: [permission] });
      return BigInt(period.spend);
    },
  };
}
