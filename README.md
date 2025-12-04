# Encrypted Wheel 🎡

A provably fair encrypted wheel game smart contract built on Solana using Arcium's Multi-Party Computation (MPC) technology.

## Overview

This project demonstrates verifiable randomness generation for a wheel of fortune game using Arcium's MPC network. Unlike traditional solutions that require trusting a centralized operator, this implementation uses distributed entropy where no single node can predict or manipulate outcomes. All results are encrypted and only decryptable by the user.

## Features

- Trustless random wheel segment selection (1-N segments)
- Verifiable randomness using distributed MPC computation
- Encrypted results that only the user can decrypt
- Event-driven architecture with callbacks

## How It Works

1. Deploy contract and initialize MPC computation definition
2. User requests wheel spin with number of segments
3. Arcium nodes generate randomness using MPC
4. Encrypted result is emitted as an event
5. User decrypts result off-chain

## Getting Started

### 1. Install Arcium CLI

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://install.arcium.com/ | bash
```

### 2. Prerequisites

- Rust 1.75+
- Solana CLI 2.3.0
- Anchor 0.32.1
- Node.js 18+ / Yarn
- Docker & Docker Compose

### 3. Install & Build

```bash
yarn install
arcium build
arcium keys sync
```

## Testing

```bash
# Localnet
arcium test

# Devnet (after deployment)
export ANCHOR_PROVIDER_URL="YOUR_RPC_URL" && \
export ANCHOR_WALLET=~/.config/solana/id.json && \
export ARCIUM_CLUSTER_OFFSET=YOUR_CLUSTER_OFFSET && \
yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts
```

## Deployment

```bash
# Deploy program
arcium deploy --cluster-offset YOUR_CLUSTER_OFFSET --keypair-path ~/.config/solana/id.json --rpc-url "YOUR_RPC_URL"

# Initialize computation definition
ANCHOR_PROVIDER_URL="YOUR_RPC_URL" ANCHOR_WALLET=~/.config/solana/id.json ARCIUM_CLUSTER_OFFSET=YOUR_CLUSTER_OFFSET yarn test
```

## Usage Example

```typescript
import { getArciumClient } from "@arcium-hq/client";

const arciumClient = await getArciumClient(provider);
const userKeypair = await arciumClient.generateUserKeypair();

// Spin the wheel
await program.methods
  .spin(0n, 8, userKeypair.publicKey, BigInt(Date.now()))
  .accounts({ payer: wallet.publicKey, /* ... */ })
  .rpc();

// Listen for results
program.addEventListener("SpinEvent", async (event) => {
  const segment = await arciumClient.decrypt(event.result, userKeypair.secretKey);
  console.log("Winning segment:", segment);
});
```

## Technical Implementation

### Key Components

- `init_spin_comp_def`: Initializes MPC computation definition
- `spin`: Queues wheel spin computation
- `spin_callback`: Handles MPC result and emits event

### MPC Circuit

```rust
pub fn spin(user: Shared, num_segments: u8) -> Enc<Shared, u8> {
    let random = ArcisRNG::gen_integer_from_width(3) as u8;
    let result = (random % num_segments) + 1;
    user.from_arcis(result)
}
```

## Troubleshooting

**PATH Issues:** Ensure `~/.cargo/bin` is in your PATH:
```bash
export PATH="$HOME/.cargo/bin:$PATH"
```

**Build Errors:**
```bash
rustup update
anchor clean && anchor build
```

**Deployment Errors:**
- Verify SOL balance: `solana balance`
- Check program ID matches in `Anchor.toml`

## Resources

- [Arcium Documentation](https://docs.arcium.com)
- [Arcium TypeScript API](https://ts.arcium.com/api)
- [Anchor Framework](https://www.anchor-lang.com)
- [Solana Documentation](https://docs.solana.com)
