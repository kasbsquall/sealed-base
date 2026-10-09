import { keccak_256 } from "@noble/hashes/sha3";

/**
 * Browser copy of agents/sealed/commitment.ts, without ethers. It builds the
 * same commitment the deployed SealedNegotiation checks:
 * keccak256(abi.encode(domainSeparator, negotiationId, party, commitIndex, offer, salt)).
 * scripts/check-web-commitment.ts compares the two implementations.
 */

const enc = new TextEncoder();

const toHex = (bytes: Uint8Array) => "0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

const fromHex = (hex: string) => {
  const clean = hex.replace(/^0x/, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
};

/** One 32-byte ABI word: uint, address and bytes32 all left-pad to 32 bytes. */
const word = (value: bigint | string) => {
  const hex = typeof value === "bigint" ? value.toString(16) : value.replace(/^0x/, "").toLowerCase();
  return fromHex(hex.padStart(64, "0"));
};

const concat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.length * 32);
  parts.forEach((p, i) => out.set(p, i * 32));
  return out;
};

const DOMAIN_TYPEHASH = keccak_256(
  enc.encode("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
);

export function domainSeparator(chainId: number, verifyingContract: string): Uint8Array {
  return keccak_256(
    concat([
      DOMAIN_TYPEHASH,
      keccak_256(enc.encode("Sealed")),
      keccak_256(enc.encode("1")),
      word(BigInt(chainId)),
      word(verifyingContract),
    ]),
  );
}

export function commitmentHash(args: {
  domain: Uint8Array;
  negotiationId: bigint;
  party: string;
  commitIndex: number;
  offer: bigint;
  salt: string;
}): string {
  return toHex(
    keccak_256(
      concat([
        args.domain,
        word(args.negotiationId),
        word(args.party),
        word(BigInt(args.commitIndex)),
        word(args.offer),
        word(args.salt),
      ]),
    ),
  );
}

export function newSalt(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}
