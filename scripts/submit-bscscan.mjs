// Submit NeonFoxAgents for verification on BscScan TESTNET (chain 97)
// via the Etherscan v2 API, using Solidity Standard JSON input.
// Usage: BSCSCAN_API_KEY=<your key> node scripts/submit-bscscan.mjs
// The key is read from the environment ONLY — it is never written to any
// file or log. The same BscScan/Etherscan API key used for mainnet (chain 56)
// works on the v2 API for chain 97.
// After submitting, the script polls checkverifystatus until it succeeds
// or fails, and records the result in verification/bscscan-result.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ADDRESS = "0x11694d4698baB0646FBdAc8D348856092C72b073";

const apiKey = process.env.BSCSCAN_API_KEY;
if (!apiKey) {
  console.error("BSCSCAN_API_KEY is not set. Run:");
  console.error("  BSCSCAN_API_KEY=<your BscScan API key> node scripts/submit-bscscan.mjs");
  console.error("Or verify manually in the browser — see verification/bscscan-manual.md");
  process.exit(2);
}

const stdJson = JSON.parse(
  fs.readFileSync(path.join(root, "verification", "standard-json.json"), "utf8")
);

const params = new URLSearchParams({
  module: "contract",
  action: "verifysourcecode",
  chainid: "97",
  contractaddress: ADDRESS,
  contractname: "NeonFoxAgents",
  compilerversion: "v0.8.26+commit.8a97fa7a",
  optimizationUsed: "1",
  runs: "200",
  evmversion: "cancun",
  licenseType: "3", // MIT
  sourceCode: JSON.stringify(stdJson),
  apikey: apiKey,
});

console.log("submitting to Etherscan v2 (chain 97)...");
const res = await fetch("https://api.etherscan.io/v2/api", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: params.toString(),
});
const body = await res.json();
console.log("submit:", JSON.stringify(body).slice(0, 500));
const guid = body.result;
if (!guid || body.status !== "1") {
  console.log("Submission failed — see above. No key was stored.");
  process.exit(1);
}

for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 10000));
  const check = await fetch(
    `https://api.etherscan.io/v2/api?chainid=97&module=contract&action=checkverifystatus&guid=${guid}&apikey=${encodeURIComponent(apiKey)}`
  );
  const cj = await check.json();
  console.log(`poll ${i + 1}:`, JSON.stringify(cj).slice(0, 400));
  if (cj.result && cj.result !== "Pending in queue") {
    fs.mkdirSync(path.join(root, "verification"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "verification", "bscscan-result.json"),
      JSON.stringify({ guid, check: cj }, null, 2)
    );
    console.log(cj.result.includes("Pass") ? "VERIFIED on BscScan testnet." : "Verification result: " + cj.result);
    process.exit(cj.result.includes("Pass") ? 0 : 1);
  }
}
console.log("Timed out polling — check the guid manually.");
