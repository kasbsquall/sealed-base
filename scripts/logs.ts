import type { Filter, JsonRpcProvider, Log } from "ethers";

/** The public Base Sepolia RPC answers eth_getLogs for at most 200 blocks at a time. */
const MAX_LOG_RANGE = 200;

/** eth_getLogs over any block range, split into windows the public RPC accepts. */
export async function getLogsChunked(provider: JsonRpcProvider, filter: Omit<Filter, "fromBlock" | "toBlock">, fromBlock: number, toBlock: number): Promise<Log[]> {
  const logs: Log[] = [];
  for (let from = fromBlock; from <= toBlock; from += MAX_LOG_RANGE) {
    logs.push(...(await provider.getLogs({ ...filter, fromBlock: from, toBlock: Math.min(from + MAX_LOG_RANGE - 1, toBlock) })));
  }
  return logs;
}
