import "dotenv/config";
import "@nomicfoundation/hardhat-toolbox";
import type { HardhatUserConfig } from "hardhat/config";

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const accounts = DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
      evmVersion: "cancun",
    },
  },
  networks: {
    // FORK_BASE_SEPOLIA=1 runs the local network as a fork of Base Sepolia, with the
    // live ERC-8004 registries, to rehearse scripts before spending testnet ETH.
    hardhat: process.env.FORK_BASE_SEPOLIA
      ? {
          forking: { url: process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org" },
          chainId: 84532,
          // Base Sepolia runs at ~0.005 gwei; the local default would overstate fees 100x.
          initialBaseFeePerGas: 5_000_000,
        }
      : {},
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org",
      chainId: 84532,
      accounts,
    },
    base: {
      url: process.env.BASE_RPC_URL ?? "https://mainnet.base.org",
      chainId: 8453,
      accounts,
    },
  },
  etherscan: {
    apiKey: process.env.BASESCAN_API_KEY ?? "",
  },
};

export default config;
