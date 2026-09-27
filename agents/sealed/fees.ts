import { parseUnits, type Provider } from "ethers";

/**
 * Explicit EIP-1559 fees from the latest block. Base charges ~0.001 gwei of tip;
 * ethers' fallback tip is 1 gwei, which would make every upfront cost 100x the
 * real one and strand small agent wallets.
 */
const TIP = parseUnits("0.001", "gwei");

export async function baseFees(provider: Provider) {
  const block = await provider.getBlock("latest");
  const base = block?.baseFeePerGas ?? parseUnits("0.01", "gwei");
  return { maxPriorityFeePerGas: TIP, maxFeePerGas: base * 2n + TIP };
}
