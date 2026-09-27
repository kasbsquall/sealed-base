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

Filled in as they happen.

| Contract | Network | Address |
|---|---|---|
| ReputationGate | Base Sepolia | pending |
| SealedNegotiation | Base Sepolia | pending |
