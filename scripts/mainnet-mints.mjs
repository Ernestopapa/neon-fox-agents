import { ethers } from "ethers";
import fs from "node:fs";
const p = new ethers.JsonRpcProvider("https://bsc-dataseed.binance.org/", 56);
const abi = JSON.parse(fs.readFileSync("./build/NeonFoxAgents.json", "utf8")).abi;
const c = new ethers.Contract("0x87129068Faf8709c9A8E997eBaE70F6074475711", abi, p);
console.log("totalSupply:", (await c.totalSupply()).toString(), "freeRemaining:", (await c.freeRemaining()).toString());
const logs = await c.queryFilter(c.filters.Transfer(ethers.ZeroAddress), 131123191, "latest");
console.log("mints (Transfer from 0x0):", logs.length);
const byMinter = {};
for (const l of logs) {
  const to = l.args.to; const id = l.args.tokenId.toString();
  byMinter[to] = byMinter[to] || [];
  byMinter[to].push(id);
}
for (const [addr, ids] of Object.entries(byMinter)) {
  console.log(addr, "-> tokens", ids.join(","));
}
console.log("user wallet freeMinted:", await c.freeMinted("0x75d251Ba39dED2E456d9f6DD776f77d422864403"));
console.log("ownerOf(1):", await c.ownerOf(1));
