import { ethers } from "ethers";
import fs from "node:fs";
const p = new ethers.JsonRpcProvider("https://bsc-dataseed.binance.org/", 56);
const abi = JSON.parse(fs.readFileSync("./build/NeonFoxAgents.json", "utf8")).abi;
const c = new ethers.Contract("0x87129068Faf8709c9A8E997eBaE70F6074475711", abi, p);
const n = Number(await c.totalSupply());
console.log("totalSupply:", n);
const owners = {};
for (let i = 1; i <= n; i++) {
  const o = await c.ownerOf(i);
  owners[o] = owners[o] || [];
  owners[o].push(i);
}
for (const [addr, ids] of Object.entries(owners)) console.log(addr, "->", ids.join(","));
console.log("user freeMinted:", await c.freeMinted("0x75d251Ba39dED2E456d9f6DD776f77d422864403"));
