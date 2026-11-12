import { ethers } from "ethers";
import fs from "node:fs";
const p = new ethers.JsonRpcProvider("https://bsc-dataseed.binance.org/", 56);
const abi = JSON.parse(fs.readFileSync("./build/NeonFoxAgents.json", "utf8")).abi;
const c = new ethers.Contract("0x87129068Faf8709c9A8E997eBaE70F6074475711", abi, p);
const USER = "0x75d251Ba39dED2E456d9f6DD776f77d422864403";
const tx = "0x1fbdacfd1354d883a4843525254ed6c10269aa74f7b3a150c12ae47f4f0a11e5";
const rc = await p.waitForTransaction(tx, 1, 120000);
console.log("receipt status:", rc ? rc.status : "TIMEOUT", "gas:", rc ? rc.gasUsed.toString() : "-", "block:", rc ? rc.blockNumber : "-");
console.log("totalSupply:", (await c.totalSupply()).toString());
console.log("freeRemaining:", (await c.freeRemaining()).toString());
console.log("user freeMinted:", await c.freeMinted(USER));
console.log("user NFOX balance:", (await c.balanceOf(USER)).toString());
const n = Number(await c.totalSupply());
for (let i = 1; i <= n; i++) {
  const o = await c.ownerOf(i);
  if (o.toLowerCase() === USER.toLowerCase()) console.log("user owns token:", i, "tokenURI:", await c.tokenURI(i));
}
console.log("user BNB:", ethers.formatEther(await p.getBalance(USER)));
