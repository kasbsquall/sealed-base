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

### Payment at the settled price (x402)

`scripts/pay-at-settled-price.ts`, after negotiation #6. The buyer agent paid the seller's API per call over x402, in Circle's USDC on Base Sepolia ([`0x036CbD53…`](https://sepolia.basescan.org/address/0x036CbD53842c5426634e7929541eC2318f3dCF7e)), at the settled 4200 US cents per 1,000 calls: 42,000 atomic USDC ($0.042) per call. The public facilitator at x402.org submitted each settlement and paid its gas. Transcript: [`demo-runs/baseSepolia-x402-6.json`](../demo-runs/baseSepolia-x402-6.json).

| Call | Price asked | Outcome | Transaction |
|---|---|---|---|
| 1 | $0.042 | paid | [`0x55342ca1…`](https://sepolia.basescan.org/tx/0x55342ca1eaf4773030fbfd144ebd90cdb8a2b70fc7a575f23e1594dcb6e30d60) |
| 2 | $0.042 | paid | [`0x75cd44e0…`](https://sepolia.basescan.org/tx/0x75cd44e07f7ea2855061d241b9cd9882611879728a52ddb8eab70b518c1233e4) |
| 3 | $0.042 | paid | [`0x6ada6d11…`](https://sepolia.basescan.org/tx/0x6ada6d1196a1c5bb93fddc856f1b451f1ea1ef0c93b72f375e57722af88f5f17) |
| surge | $0.084 | refused by the buyer before signing | none |

`npm run verify:payments -- demo-runs/baseSepolia-x402-6.json` checks each transfer on-chain against the price and wallets read from the contract, and checks that no other buyer-to-seller USDC transfer happened during the run or the five minutes after it.

#### Paid from a Base Account

`BUDGET=base-account npm run pay:x402`. The principal's USDC sits in a Base Account (Coinbase Smart Wallet v1.1, [`0x3F938cc093B02A4976238009C686aB1776140928`](https://sepolia.basescan.org/address/0x3F938cc093B02A4976238009C686aB1776140928)). It granted the buyer agent a Spend Permission on Base's SpendPermissionManager ([`0xf85210B2…`](https://sepolia.basescan.org/address/0xf85210B21cC50302F477BA56686d2019dC9b67Ad)) of $0.126 per day in [`0x7bcf0016…`](https://sepolia.basescan.org/tx/0x7bcf00165932ce9be1f81e6fb1a5cec299f68055a9cdd95390821c0f9e3a7573). The agent held no USDC of its own; before each call it drew the call's price, then paid. Transcript: [`demo-runs/baseSepolia-x402-6-base-account.json`](../demo-runs/baseSepolia-x402-6-base-account.json).

| Call | Draw from the Base Account | x402 payment to the seller |
|---|---|---|
| 1 | [`0x9dc0ded4…`](https://sepolia.basescan.org/tx/0x9dc0ded4389f5ca93a654bc24b69074baaedee683a0a99a1549cd08e528d8161) | [`0x0ab24db0…`](https://sepolia.basescan.org/tx/0x0ab24db044cbd2585c5685ac29265e1b016124967fee1ffe09264860e8863fa3) |
| 2 | [`0x48eca634…`](https://sepolia.basescan.org/tx/0x48eca634eb7a6440303305aa6c0309004681f53fadc61c1d854844f23a3b5d37) | [`0x03a80690…`](https://sepolia.basescan.org/tx/0x03a806901781845c367fe0f4c1f0e317e2dd009218fd44e10fe67bea5504bb60) |
| 3 | [`0x85d1958e…`](https://sepolia.basescan.org/tx/0x85d1958ef17e9d883923b36e6d1a4505287f1314bb8abe03db5e22e1d385720e) | [`0x9064190f…`](https://sepolia.basescan.org/tx/0x9064190fda4ac35c74959cdb38ed49f077999db077446e4ed1c959318b418026) |
| surge | none | refused by the buyer before signing |
| 4th draw | rejected: `ExceededSpendPermission(168000, 126000)` (simulated, no transaction) | none |

Earlier attempts on 2026-10-08 that stopped part-way (a stale RPC read, then a draw that ran out of gas on a low estimate) left their transactions on-chain; only the complete run above is the reference.
