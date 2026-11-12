// Build the mainnet deployment transaction data (no signing, no broadcast).
// Constructor args: real Agent ID registry, initialOwner = user's wallet.
import { ethers } from "ethers";
import fs from "node:fs";
const art = JSON.parse(fs.readFileSync("./build/NeonFoxAgents.json", "utf8"));
const factory = new ethers.ContractFactory(art.abi, art.bytecode);
const tx = await factory.getDeployTransaction(
  "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F",
  "0x75d251Ba39dED2E456d9f6DD776f77d422864403"
);
fs.writeFileSync("/tmp/neon-mainnet-deploy-data.txt", tx.data);
console.log("deploy data bytes:", (tx.data.length - 2) / 2);
console.log("predicted address check needs deployer nonce; data saved to /tmp/neon-mainnet-deploy-data.txt");
