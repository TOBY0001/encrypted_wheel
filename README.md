# Encrypted Wheel 🎡

A provably fair encrypted wheel game smart contract built on Solana using Arcium's Multi-Party Computation (MPC) technology.

## Overview

This project demonstrates verifiable randomness generation for a wheel of fortune game on the blockchain using distributed entropy. Unlike traditional gaming solutions that require trusting a centralized operator, this implementation uses Arcium's MPC network to generate truly unpredictable and provably fair wheel outcomes.

## Why MPC Randomness?

Traditional wheel game randomness has fundamental trust issues:

- **Server-side RNG**: Requires trusting operators not to manipulate outcomes
- **Client-side generation**: Can be inspected and gamed by users
- **Pseudorandom algorithms**: May have predictable patterns or biases

**Arcium's MPC Solution**: Multiple independent nodes contribute entropy. The final random value is deterministic given all inputs, but no single node (or even a dishonest majority) can predict or bias the outcome. All results are encrypted and only decryptable by the user, ensuring complete privacy and fairness.

## Features

- Trustless random wheel segment selection (1-N segments)
- Verifiable randomness using distributed MPC computation
- Encrypted results that only the user can decrypt
- No single point of failure or manipulation
- Event-driven architecture with callbacks
- Production-ready Solana smart contract

## How It Works

The wheel spin flow:

1. **Deploy Contract**: Deploy the smart contract to Solana
2. **Initialize Computation**: Set up the MPC computation definition with the offchain circuit
3. **Request Wheel Spin**: User specifies number of wheel segments
4. **Distributed Computation**: Arcium nodes collectively generate randomness using MPC
5. **Result Callback**: Encrypted segment number is returned and emitted as an event
6. **Client Decryption**: User decrypts the result off-chain to reveal the winning segment

## Getting Started

### 1. Install Arcium CLI

On Mac and Linux, run this single command to install Arcium:

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://install.arcium.com/ | bash
```

### 2. Prerequisites

Make sure you have the following installed:

- Rust 1.75+
- Solana CLI 2.3.0
- Anchor 0.32.1
- Node.js 18+ / Yarn
- Docker & Docker Compose
- Arcium CLI (installed in step 1)

### 3. Install Project Dependencies

```bash
yarn install
```

### 4. Build the Project

Compile the program and TypeScript workspace:

```bash
arcium build
```

### 5. Configure Program ID

Sync the current program keypair into your code and config (the keypair must already exist):

```bash
arcium keys sync
```

`arcium keys sync` does not create a keypair—it reads the existing one and rewrites the program ID in:

- `declare_id!()` in `programs/encrypted_wheel/src/lib.rs`
- `Anchor.toml`

The keypair is created during `arcium build` and stored in `target/deploy/encrypted_wheel-keypair.json` (or use your own if you prefer).

## Testing

### Localnet Testing

Run tests on localnet (no configuration needed):

```bash
arcium test
```

Devnet testing is only possible after deploying the program. See the deployment section for the post-deploy test command.

## Deployment to Devnet/Mainnet

### Step 1: Deploy the Program

Deploy your program to the Arcium network:

```bash
arcium deploy --cluster-offset YOUR_CLUSTER_OFFSET --keypair-path ~/.config/solana/id.json --rpc-url "YOUR_RPC_URL"
```

**Parameters:**

- `--cluster-offset`: Your Arcium cluster offset
- `--keypair-path`: Path to your Solana wallet keypair
- `--rpc-url`: Solana RPC endpoint (devnet or mainnet-beta)

### Step 2: Initialize Computation Definition

After successful deployment, initialize the MPC computation definition:

```bash
ANCHOR_PROVIDER_URL="YOUR_RPC_URL" ANCHOR_WALLET=~/.config/solana/id.json ARCIUM_CLUSTER_OFFSET=YOUR_CLUSTER_OFFSET \
  yarn test
```

This sets up the MPC environment for generating secure wheel spin randomness.

### Step 3: Run Devnet Tests (after deployment)

After deployment and computation initialization, you can run the test suite against devnet:

```bash
export ANCHOR_PROVIDER_URL="YOUR_RPC_URL" && \
export ANCHOR_WALLET=~/.config/solana/id.json && \
export ARCIUM_CLUSTER_OFFSET=YOUR_CLUSTER_OFFSET && \
yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts
```

Replace `YOUR_RPC_URL` with your Solana devnet RPC endpoint and `YOUR_CLUSTER_OFFSET` with your Arcium cluster offset.

## Usage Example

### Spinning the Wheel

```typescript
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getArciumClient } from "@arcium-hq/client";

// Initialize Arcium client
const arciumClient = await getArciumClient(provider);

// Generate user keypair for encryption
const userKeypair = await arciumClient.generateUserKeypair();

// Spin the wheel with 8 segments
const numSegments = 8;
const computationOffset = 0n;
const nonce = BigInt(Date.now());

await program.methods
  .spin(computationOffset, numSegments, userKeypair.publicKey, nonce)
  .accounts({
    payer: wallet.publicKey,
    // ... other accounts
  })
  .rpc();
```

### Listening for Results

```typescript
// Listen for SpinEvent
const listener = program.addEventListener(
  "SpinEvent",
  async (event) => {
    console.log("Wheel spin completed, encrypted result:", event.result);
    
    // Decrypt the result off-chain
    const decryptedSegment = await arciumClient.decrypt(
      event.result,
      userKeypair.secretKey
    );
    
    console.log("Winning segment:", decryptedSegment);
  }
);
```

## Technical Implementation

### Program Structure

```
programs/encrypted_wheel/
  └── src/
      └── lib.rs          # Main smart contract logic
```

### Key Components

- **`init_spin_comp_def`**: Initializes the MPC computation definition
- **`spin`**: Queues a wheel spin computation request
- **`spin_callback`**: Handles the MPC computation result
- **`SpinEvent`**: Event emitted with the encrypted segment result

### MPC Circuit

The offchain MPC circuit (`encrypted-ixs/src/lib.rs`) implements:

```rust
pub fn spin(user: Shared, num_segments: u8) -> Enc<Shared, u8> {
    let random = ArcisRNG::gen_integer_from_width(3) as u8;  // 0-7 fair random
    let result = (random % num_segments) + 1;  // Convert to 1-based indexing
    user.from_arcis(result)
}
```

### Accounts Structure

- **SignerAccount**: PDA for program signing authority
- **MXEAccount**: Arcium MPC execution environment
- **ComputationDefinitionAccount**: Defines the MPC computation parameters
- **ComputationAccount**: Individual computation instance
- **ClusterAccount**: Arcium node cluster information
- **MempoolAccount**: Arcium computation mempool
- **ExecutingPool**: Active computation execution pool
- **FeePool**: Arcium fee collection pool
- **ClockAccount**: Arcium time synchronization

### Security Features

- PDA-based signing for secure callback execution
- Computation definition validation
- Cluster verification
- Fee pool integration
- Instruction sysvar validation
- Encrypted results that only the user can decrypt
- Provably fair randomness using distributed MPC

## Project Structure

```
.
├── programs/
│   └── encrypted_wheel/      # Main smart contract
│       ├── src/
│       │   └── lib.rs
│       └── Cargo.toml
├── encrypted-ixs/            # MPC circuit logic
│   ├── src/
│   │   └── lib.rs
│   └── Cargo.toml
├── tests/                    # Integration tests
│   └── encrypted_wheel.ts
├── migrations/               # Anchor migrations
├── Anchor.toml              # Anchor configuration
├── Arcium.toml              # Arcium configuration
├── Cargo.toml               # Rust workspace
└── package.json             # Node dependencies
```

## Use Cases

This encrypted wheel game is ideal for:

- Decentralized gaming and gambling platforms
- Provably fair casino games
- Fair prize wheels and lotteries
- Random reward distribution systems
- Any scenario requiring trustless, verifiable randomness with privacy

## Why Arcium?

Arcium's MPC network provides:

- **True Randomness**: No single entity can predict or manipulate outcomes
- **Privacy**: Results are encrypted and only decryptable by the user
- **Verifiable**: All computations are cryptographically verifiable
- **Decentralized**: Multiple nodes contribute to entropy generation
- **Production-Ready**: Battle-tested MPC infrastructure on Solana

## Troubleshooting

### Common Issues

**Build Errors:**
- Ensure Rust toolchain is up to date: `rustup update`
- Check Anchor version: `avm list`
- Clean build: `anchor clean && anchor build`

**Deployment Errors:**
- Verify SOL balance: `solana balance`
- Check cluster: `solana config get`
- Ensure program ID matches in `Anchor.toml`
- Use a reliable RPC endpoint (e.g., Helius) instead of public endpoints

**MPC Errors:**
- Verify Arcium configuration in `Arcium.toml`
- Check cluster is set: `anchor test` should show cluster account
- Ensure computation definition is initialized
- Verify Arcium CLI is installed: `arcium --version`

**PATH Issues:**

If `arcium` command is not found, ensure `~/.cargo/bin` is in your PATH:

```bash
export PATH="$HOME/.cargo/bin:$PATH"
```

Add this to `~/.bashrc` or `~/.zshrc` and restart your terminal.

## Resources

- [Arcium Documentation](https://docs.arcium.com)
- [Arcium TypeScript API](https://ts.arcium.com/api)
- [Anchor Framework](https://www.anchor-lang.com)
- [Solana Documentation](https://docs.solana.com)

## License

This project is private and proprietary.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For questions and support, please open an issue in the GitHub repository.
