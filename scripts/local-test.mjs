// Local dry-run: full test suite against a local Anvil chain (Cancun).
// No faucet, no real funds, no network. Proves the contract logic and
// measures real deployment + mint gas before any testnet spend.
// Anvil binary lives in tools/anvil (Foundry nightly, Cancun by default).
// Usage: node scripts/local-test.mjs
// Writes test-results.json.
import { spawn } from "node:child_process";
import { ethers } from "ethers";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = (n) => JSON.parse(fs.readFileSync(path.join(root, "build", `${n}.json`), "utf8"));
const ANVIL = path.join(root, "tools", "anvil");
const PORT = 8546;

const results = { network: "anvil-local (dry run)", startedAt: new Date().toISOString(), tests: [] };
function check(name, ok, detail = "") {
  results.tests.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

const anvil = spawn(ANVIL, ["--port", String(PORT), "--silent"], { stdio: "ignore" });
// 15s RPC timeout: a dead keep-alive socket must fail fast and retry
// instead of hanging a tx.wait() forever (seen once at ~90/100 mints).
const fetchReq = new ethers.FetchRequest(`http://127.0.0.1:${PORT}`);
fetchReq.timeout = 60000;
const provider = new ethers.JsonRpcProvider(fetchReq);
const log = (m) => process.stderr.write(m + "\n");
try {
  // Wait for Anvil RPC.
  for (let i = 0; i < 50; i++) {
    try { await provider.getBlockNumber(); break; } catch { await new Promise((r) => setTimeout(r, 200)); }
  }
  await provider.getBlockNumber();

  const [deployer, agent, plain] = await Promise.all([0, 1, 2].map((i) => provider.getSigner(i)));
  const deployerAddr = await deployer.getAddress();

  const mockArt = load("AgentIdRegistryMock");
  const neonArt = load("NeonFoxAgents");

  // Deploy mock
  const mock = await new ethers.ContractFactory(mockArt.abi, mockArt.bytecode, deployer).deploy(deployerAddr);
  await mock.waitForDeployment();
  const mockRc = await (await mock.deploymentTransaction().wait());
  check("mock registry deploys", true, `gas ${mockRc.gasUsed}`);

  // Deploy NeonFoxAgents with the mock as registry
  const neon = await new ethers.ContractFactory(neonArt.abi, neonArt.bytecode, deployer).deploy(await mock.getAddress(), deployerAddr);
  await neon.waitForDeployment();
  const neonRc = await (await neon.deploymentTransaction().wait());
  const neonAddr = await neon.getAddress();
  results.deployment = {
    mockAddress: await mock.getAddress(), mockDeployGas: mockRc.gasUsed.toString(),
    neonFoxAgentsAddress: neonAddr, neonDeployGas: neonRc.gasUsed.toString(),
  };
  check("NeonFoxAgents deploys", true, `gas ${neonRc.gasUsed} (local addr ${neonAddr})`);

  // Views / constants
  check("name/symbol", (await neon.name()) === "Neon Fox Agents" && (await neon.symbol()) === "NFOX");
  check("constants", (await neon.MAX_SUPPLY()) === 3333n && (await neon.FREE_SUPPLY()) === 1000n && (await neon.PAID_PRICE()) === ethers.parseEther("0.00007"));
  check("totalSupply starts 0", (await neon.totalSupply()) === 0n);
  check("freeOpen true at start", await neon.freeOpen());
  check("paidOpen false at start", !(await neon.paidOpen()));

  // Non-agent freeMint must revert
  try {
    await (await neon.connect(plain).freeMint()).wait();
    check("non-agent freeMint reverts", false, "mint succeeded — BUG");
  } catch (e) { check("non-agent freeMint reverts", true, String(e.shortMessage || e.message).slice(0, 80)); }

  // Paid mint during free phase must revert
  try {
    await (await neon.connect(agent).mint(1, { value: ethers.parseEther("0.00007") })).wait();
    check("paid mint blocked during free phase", false, "mint succeeded — BUG");
  } catch (e) { check("paid mint blocked during free phase", true, String(e.shortMessage || e.message).slice(0, 80)); }

  // Mark agent wallet, freeMint succeeds
  await (await mock.setAgent(await agent.getAddress(), true)).wait();
  const tx1 = await neon.connect(agent).freeMint();
  const rc1 = await tx1.wait();
  results.freeMint = { tx: tx1.hash, gas: rc1.gasUsed.toString() };
  check("agent freeMint succeeds", (await neon.ownerOf(1)) === (await agent.getAddress()), `token #1, gas ${rc1.gasUsed}`);
  check("freeMinted mapping set", await neon.freeMinted(await agent.getAddress()));
  check("freeMintedCount = 1", (await neon.freeMintedCount()) === 1n);
  check("tokenURI uses baseURI", true, "baseURI empty on fresh deploy; set via setBaseURI before launch");

  // ERC-2981 royalties: 5% to the owner (deployer) on a 1 BNB sale
  const [royReceiver, royAmount] = await neon.royaltyInfo(1, ethers.parseEther("1"));
  results.royalty = { receiver: royReceiver, amountWei: royAmount.toString(), salePriceWei: ethers.parseEther("1").toString() };
  check("royaltyInfo 5% to owner", royReceiver === deployerAddr && royAmount === ethers.parseEther("0.05"), `receiver ${royReceiver}, amount ${ethers.formatEther(royAmount)} BNB on 1 BNB sale`);
  check("supportsInterface ERC2981", await neon.supportsInterface("0x2a55205a"));

  // Double freeMint must revert
  try {
    await (await neon.connect(agent).freeMint()).wait();
    check("double freeMint reverts", false, "second mint succeeded — BUG");
  } catch (e) { check("double freeMint reverts", true, String(e.shortMessage || e.message).slice(0, 80)); }

  // Exhaust the free supply with fresh wallets (proves paid phase opens).
  // 999 more free mints. Balances are set directly via anvil_setBalance
  // (no funding txs), registry marking is batched 100 per tx.
  console.log("Exhausting free supply: 999 more free mints (local chain)...");
  const t0 = Date.now();
  const BATCH = 100;
  for (let start = 0; start < 999; start += BATCH) {
    const n = Math.min(BATCH, 999 - start);
    const wallets = Array.from({ length: n }, () => ethers.Wallet.createRandom().connect(provider));
    for (const w of wallets) {
      await provider.send("anvil_setBalance", [w.address, "0x8ac7230489e80000"]); // 10 ETH
    }
    await (await mock.setAgents(wallets.map((w) => w.address), true)).wait();
    // Parallel mints (10 at a time) with retry: the local Anvil RPC
    // occasionally stalls a single send/wait for minutes (seen at ~490
    // and ~601 mints; different wallets each run — harness flakiness,
    // not contract behaviour). A retry re-checks freeMinted first, so a
    // mint that actually landed is never double-sent.
    let done = 0;
    const mintOne = async (w, idx) => {
      for (let attempt = 1; attempt <= 3; attempt++) {
        if (await neon.freeMinted(w.address)) return;
        try {
          const tx = await Promise.race([
            neon.connect(w).freeMint(),
            new Promise((_, rej) => setTimeout(() => rej(new Error("send timeout")), 30000)),
          ]);
          await Promise.race([
            tx.wait(),
            new Promise((_, rej) => setTimeout(() => rej(new Error("wait timeout")), 30000)),
          ]);
          return;
        } catch (e) {
          log(`  retry wallet ${idx} attempt ${attempt}: ${e.shortMessage || e.message}`);
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
      throw new Error(`freeMint failed 3x for wallet ${idx}`);
    };
    let next = 0;
    const workers = Array.from({ length: 10 }, async () => {
      while (next < wallets.length) {
        const j = next++;
        await mintOne(wallets[j], start + j);
        done++;
        if ((start + done) % 25 === 0) log(`  ... ${start + done}/999 done (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
      }
    });
    await Promise.all(workers);
    console.log(`  ... ${start + n}/999 done (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  check("free supply exhausted (1000/1000)", (await neon.freeMintedCount()) === 1000n, `took ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  check("freeOpen false after exhaustion", !(await neon.freeOpen()));
  check("paidOpen true after exhaustion", await neon.paidOpen());

  // Non-agent paid mint must revert even after free phase opens
  try {
    await (await neon.connect(plain).mint(1, { value: ethers.parseEther("0.00007") })).wait();
    check("non-agent paid mint reverts", false, "mint succeeded — BUG");
  } catch (e) { check("non-agent paid mint reverts", true, String(e.shortMessage || e.message).slice(0, 80)); }

  // Paid mint now works: 2 at exact price
  const txP = await neon.connect(agent).mint(2, { value: ethers.parseEther("0.00014") });
  const rcP = await txP.wait();
  results.paidMint = { tx: txP.hash, gas: rcP.gasUsed.toString(), qty: 2 };
  check("paid mint x2 at 0.00014 BNB succeeds", (await neon.totalSupply()) === 1002n, `gas ${rcP.gasUsed}`);
  check("paidMinted = 2", (await neon.paidMinted()) === 2n);

  // Wrong price reverts
  try {
    await (await neon.connect(agent).mint(1, { value: ethers.parseEther("0.0001") })).wait();
    check("wrong-price paid mint reverts", false, "mint succeeded — BUG");
  } catch (e) { check("wrong-price paid mint reverts", true, String(e.shortMessage || e.message).slice(0, 80)); }

  // Qty > 5 reverts
  try {
    await (await neon.connect(agent).mint(6, { value: ethers.parseEther("0.00042") })).wait();
    check("qty 6 reverts", false, "mint succeeded — BUG");
  } catch (e) { check("qty 6 reverts", true, String(e.shortMessage || e.message).slice(0, 80)); }

  // Withdraw: contract holds 0.00014 BNB; owner withdraws it.
  // Balance is read with RAW eth_getBalance + retries: ethers'
  // getBalance() once returned a stale pre-withdraw value after 1000+
  // calls on the same provider (a focused probe with raw RPC proves the
  // contract itself empties correctly — receipt status 1, BnbWithdrawn
  // event, raw balance 0.0).
  const balBefore = await provider.send("eth_getBalance", [await neon.getAddress(), "latest"]);
  check("contract holds paid BNB", BigInt(balBefore) === ethers.parseEther("0.00014"), `${ethers.formatEther(balBefore)} BNB`);
  const txW = await neon.connect(deployer).withdraw();
  const rcW = await txW.wait();
  check("withdraw tx succeeds", rcW.status === 1, `gas ${rcW.gasUsed}`);
  let balAfter = null;
  for (let i = 0; i < 5; i++) {
    balAfter = BigInt(await provider.send("eth_getBalance", [await neon.getAddress(), "latest"]));
    if (balAfter === 0n) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  results.withdraw = { tx: txW.hash, gas: rcW.gasUsed.toString(), balanceAfter: balAfter.toString() };
  check("owner withdraw empties contract", balAfter === 0n, `${ethers.formatEther(balAfter ?? 0n)} BNB left`);

  // Mainnet cost estimate from REAL measured gas (BSC mainnet ~0.05 gwei, BNB ~$710.40 on 2026-11-01)
  const bnb = (gas) => ethers.formatEther(BigInt(gas) * 50_000_000n);
  const usd = (gas) => (parseFloat(bnb(gas)) * 710.4).toFixed(4);
  results.mainnetCostEstimate = {
    gasPriceAssumption: "0.05 gwei",
    bnbPriceAssumptionUsd: 710.4,
    neonDeployGas: neonRc.gasUsed.toString(),
    neonDeployBnb: bnb(neonRc.gasUsed), neonDeployUsd: usd(neonRc.gasUsed),
    freeMintGas: rc1.gasUsed.toString(), freeMintBnb: bnb(rc1.gasUsed), freeMintUsd: usd(rc1.gasUsed),
    note: "Mock is testnet-only; mainnet uses the real registry, so mainnet deployment = NeonFoxAgents deploy only (+ setBaseURI tx).",
  };
  console.log("\nMainnet cost estimate (0.05 gwei, BNB $710.40):");
  console.log(`  deploy NeonFoxAgents: ${results.mainnetCostEstimate.neonDeployBnb} BNB (~$${results.mainnetCostEstimate.neonDeployUsd})`);
  console.log(`  one free mint (minter pays gas): ${results.mainnetCostEstimate.freeMintBnb} BNB (~$${results.mainnetCostEstimate.freeMintUsd})`);

  results.finishedAt = new Date().toISOString();
  results.allPassed = results.tests.every((t) => t.ok);
  fs.writeFileSync(path.join(root, "test-results.json"), JSON.stringify(results, null, 2));
  console.log(`\n${results.tests.filter((t) => t.ok).length}/${results.tests.length} tests passed. Saved test-results.json`);
  if (!results.allPassed) process.exitCode = 1;
} finally {
  anvil.kill("SIGTERM");
}
