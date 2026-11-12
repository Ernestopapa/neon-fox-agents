import solc from "solc";
import fs from "node:fs";
import path from "node:path";
const root = "/home/hatch/workspace/agent-mint-launch";
function findImports(p) {
  const full = p.startsWith("@") ? path.join(root, "node_modules", p) : path.resolve(root, "contracts", p);
  try { return { contents: fs.readFileSync(full, "utf8") }; } catch (e) { return { error: e.message }; }
}
for (const evm of ["shanghai", "cancun"]) {
  const input = { language: "Solidity",
    sources: { "NeonFoxAgents.sol": { content: fs.readFileSync(root + "/contracts/NeonFoxAgents.sol", "utf8") },
               "AgentIdRegistryMock.sol": { content: fs.readFileSync(root + "/contracts/AgentIdRegistryMock.sol", "utf8") } },
    settings: { evmVersion: evm, optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["evm.bytecode.opcodes", "evm.deployedBytecode.opcodes"] } } } };
  const out = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
  const errs = (out.errors || []).filter(e => e.severity === "error");
  if (errs.length) { console.log(evm, "ERRORS", errs.map(e => e.message).join("; ")); continue; }
  const c = out.contracts["NeonFoxAgents.sol"]["NeonFoxAgents"];
  const ops = c.evm.deployedBytecode.opcodes;
  const mcopy = (ops.match(/MCOPY/g) || []).length;
  const push0 = (ops.match(/PUSH0/g) || []).length;
  const tstore = (ops.match(/TSTORE|TLOAD/g) || []).length;
  console.log(evm, "deployed opcodes:", ops.split(" ").length, "MCOPY:", mcopy, "PUSH0:", push0, "transient:", tstore);
}
