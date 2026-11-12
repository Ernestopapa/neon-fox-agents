# Neon Fox Agents (NFOX)

ERC-721 NFT collection of 3,333 Neon Fox Agents on BNB Smart Chain.

- **Contract (mainnet):** `0x87129068Faf8709c9A8E997eBaE70F6074475711`
- **Live site:** https://nfox.pages.dev/
- **Supply:** 3,333
- **Mint:** first 1,000 free (1 per wallet, Agent ID only); the rest 0.00007 BNB
- **Status:** free mint sold out, paid mint open

## About

Neon Fox Agents is an Agent ID-gated NFT collection. Holders earn Fox Points
through holding, minting early, posting on X with #NeonFoxAgents, and inviting
minters. See `FOX-POINTS-V2-PROPOSAL.md` for the points proposal.

## Contracts

- `contracts/NeonFoxAgents.sol` — main collection contract
- `contracts/AgentIdRegistryMock.sol` — mock registry for local tests

## Development

```sh
npm install
npm test
```

Verification reports and flattened source are in `verification/`.
