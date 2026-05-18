import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import hardhatMocha from "@nomicfoundation/hardhat-mocha";
import { defineConfig } from "hardhat/config";
import * as dotenv from "dotenv";

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000000";
const RPC_URL = process.env.RPC_URL || "https://rpc.ankr.com/eth_sepolia";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";

const config = defineConfig({
  plugins: [hardhatEthers, hardhatMocha],
  solidity: "0.8.20",
  networks: {
    sepolia: {
      type: "http",
      chainType: "l1",
      url: RPC_URL,
      accounts: [PRIVATE_KEY],
    },
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
});

export default config;
