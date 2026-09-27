export const BASESCAN = "https://sepolia.basescan.org";

export const txUrl = (hash: string) => `${BASESCAN}/tx/${hash}`;
export const addressUrl = (address: string) => `${BASESCAN}/address/${address}`;

export const short = (hex: string, head = 6, tail = 4) => `${hex.slice(0, head)}…${hex.slice(-tail)}`;

/** Offers are integers in US cents per 1,000 API calls. */
export const dollars = (cents: string | bigint) => {
  const n = Number(cents);
  return `$${(n / 100).toFixed(2)}`;
};

export const STANCE_LABEL: Record<string, string> = {
  "open-with-room": "opens with room",
  concede: "concedes",
  hold: "holds",
  "final-at-limit": "goes to its limit",
};
