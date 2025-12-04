import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { EncryptedWheel } from "../target/types/encrypted_wheel";
import {
  getCompDefAccOffset,
  getArciumAccountBaseSeed,
  getArciumProgAddress,
  buildFinalizeCompDefTx,
  getMXEAccAddress,
  getClusterAccAddress,
} from "@arcium-hq/client";
import * as fs from "fs";
import * as os from "os";

// Devnet cluster offset - official Arcium devnet cluster
const DEVNET_CLUSTER_OFFSET = 3726127828;

describe("EncryptedWheel", () => {
  // Configure the client to use the cluster from environment
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.EncryptedWheel as Program<EncryptedWheel>;
  const provider = anchor.getProvider();

  it("Initialize spin computation definition", async () => {
    const owner = readKpJson(`${os.homedir()}/.config/solana/id.json`);

    console.log("🎲 Initializing spin computation definition...");
    console.log("Program ID:", program.programId.toString());
    console.log("Cluster:", provider.connection.rpcEndpoint);
    
    const initSig = await initSpinCompDef(program, owner);
    
    console.log("✅ Spin computation definition initialized!");
    console.log("Transaction signature:", initSig);
    console.log(`View on Solana Explorer: https://explorer.solana.com/tx/${initSig}?cluster=devnet`);
  });

  async function initSpinCompDef(
    program: Program<EncryptedWheel>,
    owner: anchor.web3.Keypair
  ): Promise<string> {
    const baseSeedCompDefAcc = getArciumAccountBaseSeed(
      "ComputationDefinitionAccount"
    );
    const offset = getCompDefAccOffset("spin");

    const compDefPDA = PublicKey.findProgramAddressSync(
      [baseSeedCompDefAcc, program.programId.toBuffer(), offset],
      getArciumProgAddress()
    )[0];

    const mxeAccount = getMXEAccAddress(program.programId);

    console.log("MXE Account:", mxeAccount.toString());
    console.log("CompDef PDA:", compDefPDA.toString());

    try {
      const sig = await program.methods
        .initSpinCompDef()
        .accounts({
          compDefAccount: compDefPDA,
          payer: owner.publicKey,
          mxeAccount: mxeAccount,
        })
        .signers([owner])
        .rpc({ commitment: "confirmed" });

      console.log("Init transaction signature:", sig);

      // Finalize the computation definition
      console.log("Finalizing computation definition...");
      const finalizeTx = await buildFinalizeCompDefTx(
        provider as anchor.AnchorProvider,
        Buffer.from(offset).readUInt32LE(),
        program.programId
      );

      const latestBlockhash = await provider.connection.getLatestBlockhash();
      finalizeTx.recentBlockhash = latestBlockhash.blockhash;
      finalizeTx.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;

      finalizeTx.sign(owner);

      const finalizeSig = await provider.sendAndConfirm(finalizeTx);
      console.log("Finalize transaction signature:", finalizeSig);

      return sig;
    } catch (error) {
      console.error("Error initializing computation definition:", error);
      throw error;
    }
  }
});

async function getMXEPublicKeyWithRetry(
  provider: anchor.AnchorProvider,
  programId: PublicKey,
  maxRetries: number = 10,
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
