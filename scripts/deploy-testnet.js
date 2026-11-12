// Deploy NeonFoxAgents + AgentIdRegistryMock to BSC TESTNET (chain 97).
// TESTNET ONLY. Never point this at mainnet, never use the user's real
// wallet key. The deployer is a FRESH throwaway wallet generated locally
// and stored in .env.testnet (gitignored, chmod 600). Only its ADDRESS
// is recorded in README.md / deployment.json.
//
// Usage:
//   node scripts/deploy-testnet.js            # deploy + run live tests
//   node scripts/deploy-testnet.js --estimate # gas estimate only, no deploy
// If the deployer has < 0.01 tBNB the script stops with faucet
// instructions (exit 2) and prints gas estimates. Fund it, then re-run
// the same command. Faucet: https://testnet.bnbchain.org/faucet-smart
import { ethers } from "ethers";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RPC = "https://data-seed-prebsc-1-s1.binance.org:8545/";
const CHAIN_ID = 97;
const FAUCET = "https://testnet.bnbchain.org/faucet-smart";
const ENV_FILE = path.join(root, ".env.testnet");
const DEPLOY_FILE = path.join(root, "deployment.json");

function loadArtifact(name) {
  return JSON.parse(fs.readFileSync(path.join(root, "build", `${name}.json`), "utf8"));
}
function loadEnv() {
  const out = {};
  if (fs.existsSync(ENV_FILE)) {
    for (const line of fs.readFileSync(ENV_FILE, "utf8").split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim();
    }
  }
  return out;
}

const provider = new ethers.JsonRpcProvider(RPC, CHAIN_ID);
const env = loadEnv();
let deployer;
if (env.DEPLOYER_PRIVATE_KEY) {
  deployer = new ethers.Wallet(env.DEPLOYER_PRIVATE_KEY, provider);
} else {
  deployer = ethers.Wallet.createRandom().connect(provider);
  fs.writeFileSync(
    ENV_FILE,
    `# TESTNET-ONLY throwaway deployer — never fund with real BNB, never use on mainnet.\n# Address: ${deployer.address}\nDEPLOYER_PRIVATE_KEY=${deployer.privateKey}\n`,
    { mode: 0o600 }
  );
  console.log("Generated fresh throwaway testnet deployer.");
}
console.log("Deployer address:", deployer.address);

const balance = await provider.getBalance(deployer.address);
console.log("Deployer tBNB balance:", ethers.formatEther(balance));
const feeData = await provider.getFeeData();
console.log("Testnet gas price:", feeData.gasPrice ? ethers.formatUnits(feeData.gasPrice, "gwei") + " gwei" : "n/a");

// Gas estimates (no funds needed for the estimate itself).
const mockArt = loadArtifact("AgentIdRegistryMock");
const neonArt = loadArtifact("NeonFoxAgents");
const mockFactory = new ethers.ContractFactory(mockArt.abi, mockArt.bytecode, deployer);
const neonFactory = new ethers.ContractFactory(neonArt.abi, neonArt.bytecode, deployer);
try {
  const mockTx = await mockFactory.getDeployTransaction(deployer.address);
  // Estimate only: the real registry will be the mock's deployed address,
  // unknown until it deploys. The deployer address is a valid non-zero
  // placeholder — deployment gas is the same either way.
  const neonTx = await neonFactory.getDeployTransaction(deployer.address, deployer.address);
  const mockGas = await provider.estimateGas({ ...mockTx, from: deployer.address });
  const neonGas = await provider.estimateGas({ ...neonTx, from: deployer.address });
  const price = feeData.gasPrice ?? 3_000_000_000n;
  console.log(`Est. deploy gas: mock ${mockGas}, NeonFoxAgents ${neonGas} (total ${mockGas + neonGas})`);
  console.log(`Est. deploy cost at ${ethers.formatUnits(price, "gwei")} gwei: ${ethers.formatEther((mockGas + neonGas) * price)} tBNB`);
  console.log(`Same gas on MAINNET at 0.05 gwei would cost ~${ethers.formatEther((mockGas + neonGas) * 50_000_000n)} BNB (mock not needed on mainnet, so NeonFoxAgents alone ~${ethers.formatEther(neonGas * 50_000_000n)} BNB)`);
} catch (e) {
  console.log("Gas estimate failed (RPC may need a funded from-address):", e.message);
}

if (process.argv.includes("--estimate")) process.exit(0);

if (balance < ethers.parseEther("0.01")) {
  console.log("\n=== BLOCKED: testnet deployer needs tBNB ===");
  console.log(`1. Open ${FAUCET}`);
  console.log(`2. Paste this address: ${deployer.address}`);
  console.log("3. Claim testnet BNB (faucet gives ~0.1 tBNB per claim).");
  console.log("4. Re-run: node scripts/deploy-testnet.js");
  console.log("   (Key is saved in .env.testnet — never share it, never fund it with real BNB.)");
  console.log("\nDry-run alternative (no faucet needed): node scripts/local-test.mjs");
  process.exit(2);
}

console.log("\nDeploying AgentIdRegistryMock...");
const mock = await mockFactory.deploy(deployer.address);
await mock.waitForDeployment();
const mockAddr = await mock.getAddress();
const mockRc = await (await mock.deploymentTransaction().wait());
console.log("Mock deployed:", mockAddr, "tx", mock.deploymentTransaction().hash, "gas", mockRc.gasUsed.toString());

// Two throwaway test wallets: one marked as Agent ID holder, one not.
const agentWallet = ethers.Wallet.createRandom().connect(provider);
const plainWallet = ethers.Wallet.createRandom().connect(provider);
console.log("Agent test wallet:", agentWallet.address);
console.log("Non-agent test wallet:", plainWallet.address);
await (await mock.setAgent(agentWallet.address, true)).wait();
console.log("Mock: agent wallet marked as Agent ID holder.");

console.log("Deploying NeonFoxAgents...");
const neon = await neonFactory.deploy(mockAddr, deployer.address);
await neon.waitForDeployment();
const neonAddr = await neon.getAddress();
const neonRc = await (await neon.deploymentTransaction().wait());
console.log("NeonFoxAgents deployed:", neonAddr, "tx", neon.deploymentTransaction().hash, "gas", neonRc.gasUsed.toString());

// Fund test wallets with a little tBNB for gas.
for (const w of [agentWallet, plainWallet]) {
  await (await deployer.sendTransaction({ to: w.address, value: ethers.parseEther("0.005") })).wait();
}

// --- Live test 1: freeMint succeeds for Agent ID holder ---
const neonAsAgent = neon.connect(agentWallet);
const tx1 = await neonAsAgent.freeMint();
const rc1 = await tx1.wait();
console.log("TEST freeMint (agent wallet): OK, tx", tx1.hash, "gas", rc1.gasUsed.toString(), "token #1 owner:", await neon.ownerOf(1));

// --- Live test 2: second freeMint from same wallet must revert ---
try {
  await (await neonAsAgent.freeMint()).wait();
  console.log("TEST double freeMint: FAIL — second mint succeeded (BUG)");
} catch (e) {
  console.log("TEST double freeMint: OK, reverted as expected:", String(e.message).slice(0, 120));
}

// --- Live test 3: non-Agent wallet must revert ---
try {
  await (await neon.connect(plainWallet).freeMint()).wait();
  console.log("TEST freeMint (non-agent): FAIL — non-agent minted (BUG)");
} catch (e) {
  console.log("TEST freeMint (non-agent): OK, reverted as expected:", String(e.message).slice(0, 120));
}

// --- Live test 4: paid mint is blocked while free supply remains ---
try {
  await (await neon.connect(agentWallet).mint(1, { value: ethers.parseEther("0.00007") })).wait();
  console.log("TEST paid mint during free phase: FAIL — paid mint succeeded early (BUG)");
} catch (e) {
  console.log("TEST paid mint during free phase: OK, reverted as expected:", String(e.message).slice(0, 120));
}

const total = await neon.totalSupply();
console.log("totalSupply after tests:", total.toString(), "| freeMintedCount:", (await neon.freeMintedCount()).toString());

const deployment = {
  network: "BSC testnet",
  chainId: CHAIN_ID,
  deployedAt: new Date().toISOString(),
  deployer: deployer.address,
  mockRegistry: mockAddr,
  mockDeployTx: mock.deploymentTransaction().hash,
  mockDeployGas: mockRc.gasUsed.toString(),
  neonAgents: neonAddr,
  neonDeployTx: neon.deploymentTransaction().hash,
  neonDeployGas: neonRc.gasUsed.toString(),
  agentTestWallet: agentWallet.address,
  plainTestWallet: plainWallet.address,
  freeMintTx: tx1.hash,
  freeMintGas: rc1.gasUsed.toString(),
  totalSupplyAfterTests: total.toString(),
  note: "TESTNET ONLY. Private keys are in .env.testnet (throwaway wallets). Never use on mainnet.",
};
fs.writeFileSync(DEPLOY_FILE, JSON.stringify(deployment, null, 2));
console.log("\nSaved:", DEPLOY_FILE);
console.log("Verify on BscScan testnet: https://testnet.bscscan.com/address/" + neonAddr);
