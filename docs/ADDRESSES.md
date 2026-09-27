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

### Agent negotiations (local model, clearing relay)

`scripts/run-demo.ts`, Qwen 2.5 14B on Ollama deciding for each agent. Transcripts in [`demo-runs/`](../demo-runs). #6 and #7 use the current agent, where the model picks a stance and a number and code writes the explanation; #3 and #5 are earlier runs with free-text reasoning from the model.

| # | Scenario | Rounds | Outcome | Closing transaction |
|---|---|---|---|---|
| 6 | Mandates overlap (buyer limit 4300, seller limit 4100) | 3 | settled at 4200 | [`0x772b8170…`](https://sepolia.basescan.org/tx/0x772b8170d9c247d73fa1e3daa93541024c855a8a1d0f2bcbe101f6fad8830a5e) |
| 7 | Mandates cannot overlap (buyer 3600, seller 4300) | 3 | expired, nothing disclosed | [`0x9a83c35c…`](https://sepolia.basescan.org/tx/0x9a83c35c6dcd7f6081f3bd2ec8bec14784baa7bf59e5bc72a4b4659dea5590be) |
| 3 | Mandates overlap (buyer limit 4300, seller limit 4100) | 2 | settled at 4175 | [`0x660fb33c…`](https://sepolia.basescan.org/tx/0x660fb33c630d72ceb7c6ec529cacb1e13adb01c1457d4dc0b164eb363fd23168) |
| 5 | Mandates cannot overlap (buyer 3600, seller 4300) | 3 | expired, nothing disclosed | [`0xe71e8eac…`](https://sepolia.basescan.org/tx/0xe71e8eac6e961eaf494b727fbc5a07c2353032cec3fdbb5ec23dc92d7fcce580) |

Negotiations #2 and #4 were development runs that stopped on a stale read from a
load-balanced RPC node (fixed in the relay). Both were later closed with `expire`:
[`#2`](https://sepolia.basescan.org/tx/0x36db8553c4000e588bd393b4bce6a2b77457884f925b8986bbab1cc4f8e23837),
[`#4`](https://sepolia.basescan.org/tx/0x58d483bc84da7322a3c883e7afb24453ac82e265410cba8da4b268a47247f5f1).
