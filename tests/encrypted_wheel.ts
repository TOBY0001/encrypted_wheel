import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Connection } from "@solana/web3.js";
import { EncryptedWheel } from "../target/types/encrypted_wheel";
import { randomBytes } from "crypto";
import {
  awaitComputationFinalization,
  getArciumEnv,
  getCompDefAccOffset,
  getArciumAccountBaseSeed,
  getArciumProgramId,
  uploadCircuit,
  buildFinalizeCompDefTx,
  deserializeLE,
  getMXEAccAddress,
  getMempoolAccAddress,
  getCompDefAccAddress,
  getExecutingPoolAccAddress,
  x25519,
  getComputationAccAddress,
  getMXEPublicKey,
  getClusterAccAddress,
  getLookupTableAddress,
  getArciumProgram,
} from "@arcium-hq/client";
import { SystemProgram } from "@solana/web3.js";

// Derive Arcium FeePool and Clock addresses from the Arcium program ID
function getArciumFeePoolAddress(): PublicKey {
  const arciumProgramId = getArciumProgramId();
  const [poolPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("FeePool")],
    arciumProgramId
  );
  return poolPDA;
}

function getArciumClockAddress(): PublicKey {
  const arciumProgramId = getArciumProgramId();
  const [clockPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("ClockAccount")],
    arciumProgramId
  );
  return clockPDA;
}
import * as fs from "fs";
import * as os from "os";

/**
 * Gets the cluster account address using the cluster offset.
 * For devnet, we use hardcoded cluster offset 456.
 * For localnet, use getArciumEnv().arciumClusterOffset
 */
function getClusterAccount(): PublicKey {
  // For devnet, use hardcoded cluster offset
  // For localnet, use: const arciumEnv = getArciumEnv(); return getClusterAccAddress(arciumEnv.arciumClusterOffset);
  return getClusterAccAddress(456);
}

/**
 * Gets the cluster offset for devnet (hardcoded) or localnet (from env)
 */
function getClusterOffset(): number {
  // For devnet, use hardcoded cluster offset
  // For localnet, use: return getArciumEnv().arciumClusterOffset;
  return 456;
}

describe("EncryptedWheel", () => {
  // Configure the client to use devnet
  const connection = new Connection(
    "https://devnet.helius-rpc.com/?api-key=0ae54321-3384-4f6d-9fd0-32eba15976f2",
    "confirmed"
  );
  const owner = readKpJson(`${os.homedir()}/.config/solana/id.json`);
  const wallet = new anchor.Wallet(owner);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  // Load program IDL for devnet (can't use anchor.workspace for devnet)
  const idlPath = require.resolve("../target/idl/encrypted_wheel.json");
  const idl = require(idlPath);
  const program = new anchor.Program(
    idl,
    provider
  ) as Program<EncryptedWheel>;

  type Event = anchor.IdlEvents<(typeof program)["idl"]>;
  const awaitEvent = async <E extends keyof Event>(
    eventName: E
  ): Promise<Event[E]> => {
    let listenerId: number;
    const event = await new Promise<Event[E]>((res) => {
      listenerId = program.addEventListener(eventName, (event) => {
        res(event);
      });
    });
    await program.removeEventListener(listenerId);

    return event;
  };

  const clusterAccount = getClusterAccount();
  const clusterOffset = getClusterOffset();

  it("spin the wheel", async () => {
    const owner = readKpJson(`${os.homedir()}/.config/solana/id.json`);

    const mxePublicKey = await getMXEPublicKeyWithRetry(
      provider as anchor.AnchorProvider,
      program.programId
    );

    console.log("MXE x25519 pubkey is", mxePublicKey);

    console.log("Initializing spin computation definition");
    // Use offchainSource=true since we're using offchain circuit storage
    const initSpinSig = await initSpinCompDef(program, owner, false, true);
    console.log(
      "Spin computation definition initialized with signature",
      initSpinSig
    );

    // The spin function takes: computation_offset, num_segments (u8), pub_key, nonce (u128)
    // num_segments is plaintext, not encrypted
    // The encryption context (pub_key, nonce) is for the Shared parameter in the circuit
    const numSegments = 8;

    // Generate encryption keys for the Shared parameter
    const privateKey = x25519.utils.randomSecretKey();
    const publicKey = x25519.getPublicKey(privateKey);

    // Generate nonce (16 bytes for u128)
    const nonce = randomBytes(16);

    const spinEventPromise = awaitEvent("spinEvent");

    const computationOffset = new anchor.BN(randomBytes(8), "hex");

    // Derive signer PDA
    const [signPdaAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("ArciumSignerAccount")],
      program.programId
    );

    const spinAccounts = {
      payer: owner.publicKey,
      signPdaAccount,
      mxeAccount: getMXEAccAddress(program.programId),
      mempoolAccount: getMempoolAccAddress(clusterOffset),
      executingPool: getExecutingPoolAccAddress(clusterOffset),
      computationAccount: getComputationAccAddress(clusterOffset, computationOffset),
      compDefAccount: getCompDefAccAddress(
        program.programId,
        Buffer.from(getCompDefAccOffset("spin")).readUInt32LE()
      ),
      clusterAccount,
      poolAccount: getArciumFeePoolAddress(),
      clockAccount: getArciumClockAddress(),
      systemProgram: SystemProgram.programId,
      arciumProgram: getArciumProgramId(),
    };

    console.log("Spin accounts:", {
      payer: spinAccounts.payer.toString(),
      signPdaAccount: spinAccounts.signPdaAccount.toString(),
      mxeAccount: spinAccounts.mxeAccount.toString(),
      compDefAccount: spinAccounts.compDefAccount.toString(),
      clusterAccount: spinAccounts.clusterAccount.toString(),
      poolAccount: spinAccounts.poolAccount.toString(),
      clockAccount: spinAccounts.clockAccount.toString(),
    });

    const queueSig = await program.methods
      .spin(
        computationOffset,
        numSegments,
        Array.from(publicKey),
        new anchor.BN(deserializeLE(nonce).toString())
      )
      .accountsPartial(spinAccounts)
      .signers([owner])
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    console.log("Queue sig is ", queueSig);

    const finalizeSig = await awaitComputationFinalization(
      provider as anchor.AnchorProvider,
      computationOffset,
      program.programId,
      "confirmed"
    );
    console.log("Finalize sig is ", finalizeSig);

    const spinEvent = await spinEventPromise;

    console.log("Spin result:", spinEvent.result);
  });

  async function initSpinCompDef(
    program: Program<EncryptedWheel>,
    owner: anchor.web3.Keypair,
    uploadRawCircuit: boolean,
    offchainSource: boolean
  ): Promise<string> {
    const baseSeedCompDefAcc = getArciumAccountBaseSeed(
      "ComputationDefinitionAccount"
    );
    const offset = getCompDefAccOffset("spin");

    const compDefPDA = PublicKey.findProgramAddressSync(
      [baseSeedCompDefAcc, program.programId.toBuffer(), offset],
      getArciumProgramId()
    )[0];

    console.log("Comp def pda is ", compDefPDA);

    // Check if CompDef already exists
    const compDefAccountInfo = await provider.connection.getAccountInfo(compDefPDA);
    let sig: string;

    // Fetch MXE account to get lutOffsetSlot for LUT address derivation (v0.7.0)
    const mxeAccount = getMXEAccAddress(program.programId);
    const arciumProgram = getArciumProgram(provider as anchor.AnchorProvider);
    const mxeAcc = await arciumProgram.account.mxeAccount.fetch(mxeAccount);
    const lutAddress = getLookupTableAddress(program.programId, mxeAcc.lutOffsetSlot);

    if (compDefAccountInfo && compDefAccountInfo.data.length > 0) {
      console.log("CompDef account already exists, skipping initialization");
      sig = "skipped-already-exists";
    } else {
      try {
        sig = await program.methods
          .initSpinCompDef()
          .accounts({
            compDefAccount: compDefPDA,
            payer: owner.publicKey,
            mxeAccount,
            addressLookupTable: lutAddress,
          })
          .signers([owner])
          .rpc({
            commitment: "confirmed",
          });
        console.log("Init spin computation definition transaction", sig);
      } catch (error: any) {
        const errorMsg = error.message || error.toString();
        if (errorMsg.includes("already in use")) {
          console.log("CompDef account already exists (concurrent creation), skipping");
          sig = "skipped-already-exists";
        } else {
          throw error;
        }
      }
    }

    // Check if CompDef is finalized by checking if comp_def_raw exists
    const compDefRawSeed = getArciumAccountBaseSeed("ComputationDefinitionRawAccount");
    const compDefRawPDA = PublicKey.findProgramAddressSync(
      [compDefRawSeed, program.programId.toBuffer(), offset],
      getArciumProgramId()
    )[0];
    const compDefRawInfo = await provider.connection.getAccountInfo(compDefRawPDA);
    
    console.log("comp_def_raw PDA:", compDefRawPDA.toString());
    console.log("comp_def_raw exists:", !!compDefRawInfo);
    if (compDefRawInfo) {
      console.log("comp_def_raw owner:", compDefRawInfo.owner.toString());
      console.log("comp_def_raw data length:", compDefRawInfo.data.length);
    }

    const isOwnedByArcium = compDefRawInfo && compDefRawInfo.owner.equals(getArciumProgramId());
    const accountExists = !!compDefRawInfo;

    if (isOwnedByArcium) {
      console.log("✅ CompDef is already finalized (comp_def_raw owned by Arcium)");
    } else if (accountExists) {
      // Account exists but not owned by Arcium - partial upload state
      console.log("⚠️ comp_def_raw exists but owned by System Program (partial upload)");
      console.log("Attempting to finalize anyway...");
      
      try {
        const finalizeTx = await buildFinalizeCompDefTx(
          provider as anchor.AnchorProvider,
          Buffer.from(offset).readUInt32LE(),
          program.programId
        );
        const latestBlockhash = await provider.connection.getLatestBlockhash();
        finalizeTx.recentBlockhash = latestBlockhash.blockhash;
        finalizeTx.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;
        finalizeTx.sign(owner);
        await provider.sendAndConfirm(finalizeTx);
        console.log("✅ CompDef finalized successfully!");
      } catch (error: any) {
        console.error("Finalization failed. The CompDef is in a corrupted state.");
        console.error("You need to deploy a new program with a fresh program ID.");
        console.error("Run: rm -f target/deploy/encrypted_wheel-keypair.json && arcium build");
        throw error;
      }
    } else if (uploadRawCircuit) {
      console.log("Uploading circuit on-chain...");
      console.log("Circuit file: build/spin.arcis");
      const rawCircuit = fs.readFileSync("build/spin.arcis");
      console.log(`Circuit size: ${rawCircuit.length} bytes`);
      
      // Upload the circuit - this will handle chunking automatically
      await uploadCircuit(
        provider as anchor.AnchorProvider,
        "spin",
        program.programId,
        rawCircuit,
        true // finalize after upload
      );
      console.log("✅ Circuit uploaded and CompDef finalized");
    } else if (!offchainSource) {
      console.log("Finalizing CompDef...");
      try {
        const finalizeTx = await buildFinalizeCompDefTx(
          provider as anchor.AnchorProvider,
          Buffer.from(offset).readUInt32LE(),
          program.programId
        );

        const latestBlockhash = await provider.connection.getLatestBlockhash();
        finalizeTx.recentBlockhash = latestBlockhash.blockhash;
        finalizeTx.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;

        finalizeTx.sign(owner);

        await provider.sendAndConfirm(finalizeTx);
        console.log("✅ CompDef finalized");
      } catch (error: any) {
        const errorMsg = error.message || error.toString();
        if (errorMsg.includes("already finalized") || errorMsg.includes("already in use")) {
          console.log("✅ CompDef already finalized, continuing...");
        } else {
          console.error("Finalization failed:", errorMsg);
          throw error;
        }
      }
    }
    return sig;
  }
});

async function getMXEPublicKeyWithRetry(
  provider: anchor.AnchorProvider,
  programId: PublicKey,
  maxRetries: number = 20,
  retryDelayMs: number = 500
): Promise<Uint8Array> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const mxePublicKey = await getMXEPublicKey(provider, programId);
      if (mxePublicKey) {
        return mxePublicKey;
      }
    } catch (error) {
      console.log(`Attempt ${attempt} failed to fetch MXE public key:`, error);
    }

    if (attempt < maxRetries) {
      console.log(
        `Retrying in ${retryDelayMs}ms... (attempt ${attempt}/${maxRetries})`
      );
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  throw new Error(
    `Failed to fetch MXE public key after ${maxRetries} attempts`
  );
}

function readKpJson(path: string): anchor.web3.Keypair {
  const file = fs.readFileSync(path);
  return anchor.web3.Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(file.toString()))
  );
}
