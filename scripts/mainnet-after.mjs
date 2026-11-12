// Wait for the mainnet setBaseURI tx, verify it, then return the deployer's leftover BNB to the user.
import { ethers } from "ethers";
import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
const RPC = "https://bsc-dataseed.binance.org/";
const CONTRACT = "0x87129068Faf8709c9A8E997eBaE70F6074475711";
const USER = "0x75d251Ba39dED2E456d9f6DD776f77d422864403";
const provider = new ethers.JsonRpcProvider(RPC, 56);
const txHash = "0x444d0674c76f2570312995ec414465cd2192d00f1a82cb12b9074274ef144511";
console.log("waiting for setBaseURI receipt...");
const rc = await provider.waitForTransaction(txHash, 1, 120000);
console.log("setBaseURI receipt status:", rc ? rc.status : "TIMEOUT", "gas:", rc ? rc.gasUsed.toString() : "-", "block:", rc ? rc.blockNumber : "-");
const abi = JSON.parse(fs.readFileSync("./build/NeonFoxAgents.json", "utf8")).abi;
const c = new ethers.Contract(CONTRACT, abi, provider);
console.log("owner():", await c.owner());
console.log("totalSupply:", (await c.totalSupply()).toString());
try { console.log("tokenURI(1):", await c.tokenURI(1)); }
catch (e) { console.log("tokenURI(1) reverts (expected, no mints yet):", e.message.slice(0, 120)); }
// Return deployer leftover to the user
const env = {};
for (const line of fs.readFileSync(path.join(root, ".env.mainnet"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim();
}
const deployer = new ethers.Wallet(env.DEPLOYER_PRIVATE_KEY, provider);
const bal = await provider.getBalance(deployer.address);
console.log("deployer BNB before return:", ethers.formatEther(bal));
const fee = await provider.getFeeData();
const gasPrice = fee.gasPrice;
const gasLimit = 21000n;
const amount = bal - gasPrice * gasLimit;
const tx = await deployer.sendTransaction({ to: USER, value: amount, gasLimit, gasPrice });
console.log("return tx:", tx.hash);
const rrc = await tx.wait();
console.log("return receipt status:", rrc.status);
console.log("deployer BNB after:", ethers.formatEther(await provider.getBalance(deployer.address)));
console.log("user BNB after:", ethers.formatEther(await provider.getBalance(USER)));
