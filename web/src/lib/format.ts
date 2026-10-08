export const BASESCAN = "https://sepolia.basescan.org";

export const txUrl = (hash: string) => `${BASESCAN}/tx/${hash}`;
export const addressUrl = (address: string) => `${BASESCAN}/address/${address}`;

export const short = (hex: string, head = 6, tail = 4) => `${hex.slice(0, head)}…${hex.slice(-tail)}`;

/** Offers are integers in US cents per 1,000 API calls. */
export const dollars = (cents: string | bigint) => {
  const n = Number(cents);
  return `$${(n / 100).toFixed(2)}`;
};

/** Atomic USDC (6 decimals) as dollars, exact, with at least three decimals: 42000 is $0.042. */
export const usdc = (atomic: string | bigint) => {
  const fraction = (BigInt(atomic) % 1_000_000n).toString().padStart(6, "0").replace(/0{1,3}$/, "");
  return `$${BigInt(atomic) / 1_000_000n}.${fraction}`;
};

export const STANCE_LABEL: Record<string, string> = {
  "open-with-room": "opens with room",
  concede: "concedes",
  hold: "holds",
  "final-at-limit": "goes to its limit",
};
