// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Royalty.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IAgentIdRegistry {
    function balanceOf(address owner) external view returns (uint256);
}

/// @title Neon Fox Agents — final name, picked by the user 2026-11-01
///         (symbol NFOX, fox art in art/neon-fox.webp)
/// @notice Binance Agent ID NFT mint, modelled on the proven Agent Harvest
///         Land pattern (0xacf150d9eC909E3d339Bf4c6D090b18495674E66):
///         ERC721 + Ownable + ReentrancyGuard, registry address passed in
///         the constructor, 1 free mint per Agent ID holder.
///         Supply: 3,333 total = 1,000 FREE (gas only, Agent ID holders
///         only, 1 per wallet ever) + 2,333 PAID at 0.00007 BNB each,
///         PAID ALSO Agent ID holders only (user confirmed 2026-11-01).
///         Paid price math: $0.05 / $710.40 per BNB = 0.0000704 BNB,
///         rounded to 0.00007 ether. Paid minting only opens once the
///         free 1,000 are exhausted. 5% ERC-2981 royalties (500 bps)
///         to the owner on secondary sales, no allowlist, no oracle,
///         no extra signatures in this testnet version.
///         Mainnet registry: 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F
///         Testnet: deploy AgentIdRegistryMock first and pass its address.
contract NeonFoxAgents is ERC721, ERC721Royalty, Ownable, ReentrancyGuard {
    IAgentIdRegistry public immutable agentIdRegistry;

    uint256 public constant MAX_SUPPLY = 3333;
    // FREE_SUPPLY is the single knob for the free phase: change this one
    // line to 500 and PAID_SUPPLY below follows automatically (2,833).
    uint256 public constant FREE_SUPPLY = 1000;
    uint256 public constant PAID_SUPPLY = MAX_SUPPLY - FREE_SUPPLY; // 2,333
    uint256 public constant PAID_PRICE = 0.00007 ether; // ~$0.05 at $710.40/BNB
    uint256 public constant MAX_PAID_PER_TX = 5;

    /// @notice True once an address has used its one free mint.
    mapping(address => bool) public freeMinted;

    uint256 public paidMinted;
    uint256 private _freeCount;
    uint256 private _nextId = 1;

    string private _base;

    event FreeMinted(address indexed to, uint256 indexed tokenId);
    event PaidMinted(address indexed to, uint256 indexed tokenId);
    event BnbWithdrawn(address indexed to, uint256 amount);

    constructor(address agentIdRegistry_, address initialOwner)
        ERC721("Neon Fox Agents", "NFOX")
        Ownable(initialOwner)
    {
        require(agentIdRegistry_ != address(0), "zero registry");
        agentIdRegistry = IAgentIdRegistry(agentIdRegistry_);
        // 5% ERC-2981 default royalty to the owner (500 / 10000 bps).
        _setDefaultRoyalty(initialOwner, 500);
    }

    /// @notice ERC-2981 + ERC-721 interface support (required override).
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Royalty)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    // ------------------------------------------------------------- metadata
    function setBaseURI(string calldata uri) external onlyOwner {
        _base = uri;
    }

    function _baseURI() internal view override returns (string memory) {
        return _base;
    }

    // ----------------------------------------------------------------- views
    function totalSupply() public view returns (uint256) {
        return _nextId - 1;
    }

    /// @notice Number of free mints used so far (0..1000).
    function freeMintedCount() public view returns (uint256) {
        return _freeCount;
    }

    function freeRemaining() public view returns (uint256) {
        return FREE_SUPPLY - _freeCount;
    }

    function paidRemaining() public view returns (uint256) {
        return MAX_SUPPLY - FREE_SUPPLY - paidMinted;
    }

    function freeOpen() public view returns (bool) {
        return _freeCount < FREE_SUPPLY;
    }

    function paidOpen() public view returns (bool) {
        return _freeCount >= FREE_SUPPLY && totalSupply() < MAX_SUPPLY;
    }

    // ------------------------------------------------------------ free mint
    /// @notice Free mint: 1 per wallet ever, Agent ID holders only,
    ///         gas only. Non-payable, so any attached BNB reverts (value 0).
    function freeMint() external nonReentrant {
        require(_freeCount < FREE_SUPPLY, "free supply exhausted");
        require(!freeMinted[msg.sender], "already claimed free");
        require(agentIdRegistry.balanceOf(msg.sender) > 0, "no Agent ID");

        freeMinted[msg.sender] = true;
        _freeCount += 1;

        uint256 tokenId = _nextId++;
        _safeMint(msg.sender, tokenId);
        emit FreeMinted(msg.sender, tokenId);
    }

    // ------------------------------------------------------------ paid mint
    /// @notice Paid mint, only after the free 1,000 are exhausted.
    ///         Agent ID holders only, max 5 per tx, exact payment required.
    function mint(uint256 qty) external payable nonReentrant {
        require(qty > 0 && qty <= MAX_PAID_PER_TX, "qty 1..5");
        require(_freeCount >= FREE_SUPPLY, "paid mint not open yet");
        require(agentIdRegistry.balanceOf(msg.sender) > 0, "no Agent ID");
        require(msg.value == PAID_PRICE * qty, "wrong price");
        require(totalSupply() + qty <= MAX_SUPPLY, "exceeds max supply");

        paidMinted += qty;
        for (uint256 i = 0; i < qty; i++) {
            uint256 tokenId = _nextId++;
            _safeMint(msg.sender, tokenId);
            emit PaidMinted(msg.sender, tokenId);
        }
    }

    // ----------------------------------------------------------------- BNB
    /// @notice Withdraw BNB revenue (paid mints). Only way BNB leaves.
    function withdraw() external onlyOwner {
        uint256 amount = address(this).balance;
        require(amount > 0, "nothing to withdraw");
        (bool ok, ) = payable(owner()).call{value: amount}("");
        require(ok, "BNB send failed");
        emit BnbWithdrawn(owner(), amount);
    }

    receive() external payable {}
}
