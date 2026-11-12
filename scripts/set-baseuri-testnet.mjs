// Set baseURI on the BSC TESTNET NeonFoxAgents contract (owner = throwaway deployer).
// TESTNET ONLY. Usage: node scripts/set-baseuri-testnet.mjs "https://neonfoxagents.netlify.app/metadata/"
import { ethers } from "ethers";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RPC = "https://data-seed-prebsc-1-s1.binance.org:8545/";
const CONTRACT = "0xBEeBd32ffFEDC1F2b17c9B07795e2C9B5559bA22";
const baseURI = process.argv[2];
if (!baseURI || !baseURI.endsWith("/")) { console.error("Usage: node scripts/set-baseuri-testnet.mjs <baseURI ending with />"); process.exit(2); }
const env = {};
for (const line of fs.readFileSync(path.join(root, ".env.testnet"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim();
}
const provider = new ethers.JsonRpcProvider(RPC, 97);
const wallet = new ethers.Wallet(env.DEPLOYER_PRIVATE_KEY, provider);
const abi = JSON.parse(fs.readFileSync(path.join(root, "build/NeonFoxAgents.json"), "utf8")).abi;
const c = new ethers.Contract(CONTRACT, abi, wallet);
console.log("owner:", await c.owner(), "signer:", wallet.address);
console.log("totalSupply:", await c.totalSupply());
console.log("tokenURI(1) before:", await c.tokenURI(1).catch(e => "ERR " + e.message));
const tx = await c.setBaseURI(baseURI);
console.log("setBaseURI tx:", tx.hash);
const rc = await tx.wait();
console.log("receipt status:", rc.status, "gas:", rc.gasUsed.toString());
console.log("tokenURI(1) after:", await c.tokenURI(1));
console.log("deployer tBNB left:", ethers.formatEther(await provider.getBalance(wallet.address)));
