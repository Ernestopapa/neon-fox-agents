import { ethers } from "ethers";
import fs from "node:fs";
const p = new ethers.JsonRpcProvider("https://bsc-dataseed.binance.org/", 56);
const abi = JSON.parse(fs.readFileSync("./build/NeonFoxAgents.json", "utf8")).abi;
const c = new ethers.Contract("0x87129068Faf8709c9A8E997eBaE70F6074475711", abi, p);
const USER = "0x75d251Ba39dED2E456d9f6DD776f77d422864403";
const n = Number(await c.totalSupply());
const owners = new Set();
for (let i = 1; i <= n; i++) owners.add((await c.ownerOf(i)).toLowerCase());
console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  totalSupply: n,
  freeRemaining: Number(await c.freeRemaining()),
  freeMinted: 1000 - Number(await c.freeRemaining()),
  uniqueHolders: owners.size,
  paidOpen: await c.paidOpen(),
  contractBNB: ethers.formatEther(await p.getBalance("0x87129068Faf8709c9A8E997eBaE70F6074475711")),
  userBNB: ethers.formatEther(await p.getBalance(USER)),
  userNFOX: Number(await c.balanceOf(USER)),
  royaltyInfo1BNB: (await c.royaltyInfo(1, ethers.parseEther("1")))[1].toString()
}, null, 2));
