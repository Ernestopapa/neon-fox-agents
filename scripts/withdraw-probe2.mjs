// Withdraw probe v2: check the balance with RAW RPC (fetch), bypassing
// the ethers provider object entirely, at latest + at receipt block.
import { spawn } from "node:child_process";
import { ethers } from "ethers";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = (n) => JSON.parse(fs.readFileSync(path.join(root, "build", `${n}.json`), "utf8"));
const PORT = 8551;
const URL = `http://127.0.0.1:${PORT}`;
const anvil = spawn(path.join(root, "tools", "anvil"), ["--port", String(PORT), "--silent"], { stdio: "ignore" });
async function raw(method, params) {
  const r = await fetch(URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const j = await r.json();
  if (j.error) throw new Error(method + ": " + JSON.stringify(j.error));
  return j.result;
}
const T0 = Date.now();
const log = (m) => process.stderr.write(`[${((Date.now() - T0) / 1000).toFixed(1)}s] ${m}\n`);
try {
  const fetchReq = new ethers.FetchRequest(URL);
  fetchReq.timeout = 10000;
  const provider = new ethers.JsonRpcProvider(fetchReq);
  for (let i = 0; i < 50; i++) { try { await provider.getBlockNumber(); break; } catch { await new Promise((r) => setTimeout(r, 200)); } }
  log("anvil up");
  const deployer = await provider.getSigner(0);
  const deployerAddr = await deployer.getAddress();
  const mock = await new ethers.ContractFactory(load("AgentIdRegistryMock").abi, load("AgentIdRegistryMock").bytecode, deployer).deploy(deployerAddr);
  await mock.waitForDeployment();
  const neon = await new ethers.ContractFactory(load("NeonFoxAgents").abi, load("NeonFoxAgents").bytecode, deployer).deploy(await mock.getAddress(), deployerAddr);
  await neon.waitForDeployment();
  const addr = await neon.getAddress();
  log("deployed neon at " + addr);
  await (await deployer.sendTransaction({ to: addr, value: ethers.parseEther("0.00014") })).wait();
  log("raw balance after fund: " + ethers.formatEther(await raw("eth_getBalance", [addr, "latest"])));
  const tx = await neon.connect(deployer).withdraw();
  const rc = await tx.wait();
  log("withdraw status=" + rc.status + " block=" + rc.blockNumber + " logs=" + rc.logs.length);
  for (const l of rc.logs) log("  log topics=" + l.topics.join(",") + " data=" + l.data);
  log("raw balance latest: " + ethers.formatEther(await raw("eth_getBalance", [addr, "latest"])));
  log("raw balance @receipt block: " + ethers.formatEther(await raw("eth_getBalance", [addr, "0x" + rc.blockNumber.toString(16)])));
  log("ethers balance latest: " + ethers.formatEther(await provider.getBalance(addr)));
  log("raw owner balance: " + ethers.formatEther(await raw("eth_getBalance", [deployerAddr, "latest"])));
  process.exit(0);
} finally {
  anvil.kill("SIGTERM");
}
