import { ethers } from "ethers";
import fs from "node:fs";
const p = new ethers.JsonRpcProvider("https://data-seed-prebsc-1-s1.binance.org:8545/", 97);
const abi = JSON.parse(fs.readFileSync("./build/NeonFoxAgents.json", "utf8")).abi;
const c = new ethers.Contract("0xBEeBd32ffFEDC1F2b17c9B07795e2C9B5559bA22", abi, p);
console.log("tokenURI(1):", await c.tokenURI(1));
console.log("totalSupply:", (await c.totalSupply()).toString());
console.log("ownerOf(1):", await c.ownerOf(1));
