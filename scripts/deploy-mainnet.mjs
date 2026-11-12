// Deploy NeonFoxAgents to BSC MAINNET (chain 56). REAL BNB, REAL MONEY.
// Deployer is the throwaway in .env.mainnet (funded 0.001 BNB by the user).
// Constructor: real Agent ID registry, initialOwner = USER wallet.
// NEVER use the user's real wallet key here; NEVER point this at testnet.
import { ethers } from "ethers";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RPC = "https://bsc-dataseed.binance.org/";
const CHAIN_ID = 56;
const REGISTRY = "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F";
const OWNER = "0x75d251Ba39dED2E456d9f6DD776f77d422864403";
const env = {};
for (const line of fs.readFileSync(path.join(root, ".env.mainnet"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim();
}
if (!env.DEPLOYER_PRIVATE_KEY) { console.error("No .env.mainnet key"); process.exit(2); }
const provider = new ethers.JsonRpcProvider(RPC, CHAIN_ID);
const deployer = new ethers.Wallet(env.DEPLOYER_PRIVATE_KEY, provider);
console.log("Deployer:", deployer.address);
console.log("Deployer BNB:", ethers.formatEther(await provider.getBalance(deployer.address)));
const art = JSON.parse(fs.readFileSync(path.join(root, "build/NeonFoxAgents.json"), "utf8"));
const factory = new ethers.ContractFactory(art.abi, art.bytecode, deployer);
const deployTx = await factory.getDeployTransaction(REGISTRY, OWNER);
const gasEst = await provider.estimateGas({ ...deployTx, from: deployer.address });
const fee = await provider.getFeeData();
console.log("Est deploy gas:", gasEst.toString(), "gasPrice gwei:", ethers.formatUnits(fee.gasPrice, "gwei"));
console.log("Est cost BNB:", ethers.formatEther(gasEst * fee.gasPrice));
console.log("Deploying to MAINNET...");
const contract = await factory.deploy(REGISTRY, OWNER);
console.log("Deploy tx:", contract.deploymentTransaction().hash);
console.log("Contract address (pending):", await contract.getAddress());
const rc = await contract.deploymentTransaction().wait();
console.log("Receipt status:", rc.status, "gas used:", rc.gasUsed.toString(), "block:", rc.blockNumber);
const addr = await contract.getAddress();
console.log("Contract:", addr);
console.log("owner():", await contract.owner());
console.log("totalSupply:", (await contract.totalSupply()).toString());
console.log("freeRemaining:", (await contract.freeRemaining()).toString());
console.log("freeOpen:", await contract.freeOpen(), "paidOpen:", await contract.paidOpen());
console.log("royaltyInfo(1, 1 BNB):", await contract.royaltyInfo(1, ethers.parseEther("1")));
fs.writeFileSync(path.join(root, "deployment-mainnet.json"), JSON.stringify({
  network: "BSC mainnet", chainId: 56, deployedAt: new Date().toISOString(),
  deployer: deployer.address, neonAgents: addr,
  neonDeployTx: contract.deploymentTransaction().hash,
  neonDeployGas: rc.gasUsed.toString(),
  registry: REGISTRY, owner: OWNER,
  baseURI: "https://neonfoxagents.netlify.app/metadata/",
  note: "MAINNET. Owner is the user wallet. Deployer is throwaway, key in .env.mainnet."
}, null, 2));
console.log("Saved deployment-mainnet.json");
console.log("Deployer BNB left:", ethers.formatEther(await provider.getBalance(deployer.address)));
