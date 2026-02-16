# 🎰 Encrypted Wheel - Arcium MPC Randomness

A privacy-preserving wheel spin implementation powered by **Arcium's Multi-Party Computation (MPC)** on Solana. This program generates provably fair, encrypted random outcomes that cannot be predicted or manipulated by any single party.

## Overview

Encrypted Wheel leverages Arcium's MXE (Multi-party eXecution Environment) to perform secure randomness generation using threshold cryptography. The spin result is computed collaboratively by a cluster of MPC nodes, ensuring:

- **Unpredictability**: No single party can predict or influence the outcome
- **Verifiability**: Results are cryptographically signed by the MPC cluster
- **Privacy**: The random value is encrypted and only the requesting user can decrypt it


## Front-end repo

https://github.com/TOBY0001/arcis-wheel

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client (Frontend)                        │
│  • Encrypts input with x25519 public key                        │
│  • Submits spin request                                          │
│  • Decrypts result off-chain                                     │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Solana Program (Anchor)                       │
│  programs/encrypted_wheel/src/lib.rs                            │
│  • Queues computation requests                                   │
│  • Handles MPC callbacks                                         │
│  • Emits encrypted SpinEvent                                     │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Arcium MXE Cluster (Cerberus)                  │
│  encrypted-ixs/src/lib.rs                                       │
│  • Executes spin() circuit                                       │
│  • Generates secure random number                                │
│  • Returns BLS-signed encrypted result                           │
└─────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
encrypted_wheel/
├── programs/
│   └── encrypted_wheel/
│       └── src/
│           └── lib.rs          # Main Anchor program
├── encrypted-ixs/
│   └── src/
│       └── lib.rs              # Arcium encrypted circuit (MPC logic)
├── tests/
│   └── encrypted_wheel.ts      # Integration tests
├── Anchor.toml                 # Anchor configuration
├── Arcium.toml                 # Arcium localnet configuration
├── Cargo.toml                  # Rust workspace configuration
└── package.json                # Node.js dependencies
```

## Core Components

### 1. Encrypted Circuit (`encrypted-ixs/src/lib.rs`)

The heart of the MPC computation - generates secure random outcomes:

```rust
#[instruction]
pub fn spin(user: Shared, num_segments: u8) -> Enc<Shared, u8> {
    // Generate a fair random number from 1 to num_segments
    let random = ArcisRNG::gen_integer_from_width(3) as u8;  // 0-7 fair random
    let result = (random % num_segments) + 1;  // 1-based indexing
    user.from_arcis(result)
}
```

### 2. Anchor Program (`programs/encrypted_wheel/src/lib.rs`)

The on-chain program that orchestrates MPC interactions:

| Instruction | Description |
|-------------|-------------|
| `init_spin_comp_def` | Initializes the computation definition (one-time setup) |
| `spin` | Queues a wheel spin computation with encrypted parameters |
| `spin_callback` | Handles MPC results and emits `SpinEvent` |

### 3. Events

```rust
#[event]
pub struct SpinEvent {
    /// Encrypted result (1 to num_segments), decrypted client-side
    pub result: [u8; 32],
}
```

## Deployment

**Program ID:** `BvRkheZC465X6PhhkHrkuUo1o7mHWF1d1tJm3kzts92o`

**Network:** Solana Devnet (Helius RPC)

## Prerequisites

- [Rust](https://rustup.rs/) (1.89.0 via `rust-toolchain.toml`)
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools)
- [Anchor CLI](https://www.anchor-lang.com/docs/installation) (0.32.1)
- [Arcium CLI](https://docs.arcium.com) (0.8.0)
- [Node.js](https://nodejs.org/) & Yarn

## Installation

```bash
# Install dependencies
npm install

# Build the program
arcium build

# Deploy to devnet
arcium deploy
```

## Testing

### Initialize Computation Definition

Before spinning, the computation definition must be initialized (one-time):

```bash
arcium test --skip-local-validator
```


## Usage Flow

1. **Client generates x25519 keypair** for encryption
2. **Client calls `spin`** with:
   - `computation_offset`: Unique computation ID
   - `num_segments`: Number of wheel segments (1-8)
   - `pub_key`: Client's x25519 public key
   - `nonce`: Unique nonce for encryption
3. **MPC cluster executes** the `spin` circuit collaboratively
4. **Callback emits `SpinEvent`** with encrypted result
5. **Client decrypts** the result using their private key

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `anchor-lang` | 0.32.1 | Solana program framework |
| `arcium-anchor` | 0.8.0 | Arcium integration with Anchor |
| `arcium-client` | 0.8.0 | Arcium client utilities |
| `arcium-macros` | 0.8.0 | Arcium procedural macros |
| `arcis-imports` | 0.8.0 | Arcium circuit primitives |
| `@arcium-hq/client` | 0.8.0 | TypeScript client SDK |

## Configuration

### Arcium.toml

```toml
[localnet]
nodes = 2                      # MPC cluster size
localnet_timeout_secs = 300    # Startup timeout
backends = ["Cerberus"]        # MPC backend
```

### Anchor.toml

```toml
[programs.devnet]
encrypted_wheel = "BvRkheZC465X6PhhkHrkuUo1o7mHWF1d1tJm3kzts92o"

[provider]
cluster = "devnet"
```

## Security Considerations

- **Threshold Security**: Requires consensus from MPC nodes (Cerberus backend)
- **BLS Signatures**: All outputs are cryptographically signed by the cluster
- **Encryption**: Results are encrypted with user's public key - only they can decrypt
- **No Single Point of Failure**: Random generation is distributed across multiple nodes

## Resources

- [Arcium Developer Docs](https://docs.arcium.com/developers)
- [Arcium TypeScript SDK](https://ts.arcium.com/api)
- [Anchor Documentation](https://www.anchor-lang.com/)

## License

ISC License - See [LICENSE](../../LICENSE) for details.

---

Built with ❤️ using [Arcium](https://arcium.com) × [Anchor](https://www.anchor-lang.com)

