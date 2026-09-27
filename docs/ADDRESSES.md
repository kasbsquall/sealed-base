# Addresses and network information

## ERC-8004 canonical registries

Sealed does not deploy its own identity or reputation registries. The ERC-8004 team
deployed singletons at the same CREATE2 vanity addresses on every supported chain.
Sealed reads those.

| Registry | Base Sepolia (84532) | Base mainnet (8453) |
|---|---|---|
| IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| ReputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` |
| ValidationRegistry | not deployed | not deployed |

Source: [erc-8004/erc-8004-contracts README](https://github.com/erc-8004/erc-8004-contracts).

Checked on-chain against Base Sepolia on 2026-09-17: both addresses return ERC-1967
proxy bytecode from `eth_getCode`, and `name()` on the Identity Registry returns
`AgentIdentity`.

The Validation Registry is not deployed on Base. Sealed does not depend on it.

## Base Sepolia

| | |
|---|---|
| Chain ID | 84532 |
| RPC | `https://sepolia.base.org` |
| Explorer | https://sepolia.basescan.org |
| Faucets | https://docs.base.org/base-chain/tools/network-faucets |
| Currency | ETH |

## Sealed deployments

Base Sepolia, deployed 2026-09-27. Source verified on Sourcify with an exact
creation and runtime match (`node scripts/verify-sourcify.cjs` reproduces it).

| Contract | Address |
|---|---|
| ReputationGate | [`0xDC237A8ade5dd125A18146f1b5943eE4E975a407`](https://sepolia.basescan.org/address/0xDC237A8ade5dd125A18146f1b5943eE4E975a407) |
| SealedNegotiation | [`0x0C0E12C9C77FAcDa9302514A818DF232346e773A`](https://sepolia.basescan.org/address/0x0C0E12C9C77FAcDa9302514A818DF232346e773A) |

### Demo agents (seeded)

Registered in the canonical ERC-8004 Identity Registry on Base Sepolia by
`scripts/seed-demo.ts`. Their reputation comes from three demo reviewers created
by the same script, so it proves the integration with the real registries, not
real-world trust.

| Agent | ERC-8004 agentId | Feedback from trusted reviewers | Clears the demo policy |
|---|---|---|---|
| buyer | 9341 | 6 entries, average 4.70 | yes |
| seller | 9342 | 6 entries, average 4.38 | yes |
| newcomer | 9343 | 1 entry, 5.00 | no, too little history |

Demo policy: at least 5 entries from the three named reviewers, averaging at least 4.00.
Full record, including every feedback transaction: [`deployments/baseSepolia.json`](../deployments/baseSepolia.json).

### First live negotiation (scripted, no LLM)

`scripts/smoke-negotiation.ts`, negotiation #1. Buyer ceiling 42.50, seller floor 39.80, prices in US cents.

| Step | Transaction |
|---|---|
| Gate refuses the newcomer | `NotAdmitted` on a static call, no transaction |
| Open negotiation | [`0xc1373cc4…`](https://sepolia.basescan.org/tx/0xc1373cc4093af99833029ef31c225b7a39ef4d0c3e4b023fd7b47f6a353e9b4e) |
| Buyer commits (offer not in calldata) | [`0xa62210cd…`](https://sepolia.basescan.org/tx/0xa62210cd8ab8d1288f80b7df487de2a0bf3f347ca7e9eb9123e01e6d75a043dc) |
| Seller commits (offer not in calldata) | [`0x1d6f6ad1…`](https://sepolia.basescan.org/tx/0x1d6f6ad16a7b9c1272ce360949d0e702c2ba1c28435cfeff8c8ddbb3e3ae49b3) |
| Atomic settlement at 41.15 | [`0x3c8a95a1…`](https://sepolia.basescan.org/tx/0x3c8a95a18eb705f34a22e76be6c813b545ff0602ebd3c99e695d22964cbe35c9) |
