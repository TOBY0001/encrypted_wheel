use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::{CircuitSource, OffChainCircuitSource};

const COMP_DEF_OFFSET_SPIN: u32 = comp_def_offset("spin");

declare_id!("BvRkheZC465X6PhhkHrkuUo1o7mHWF1d1tJm3kzts92o");

#[arcium_program]
pub mod encrypted_wheel {
    use super::*;

    /// Initializes the computation definition for the wheel spin operation.
    /// Uses offchain storage for the circuit (recommended for circuits > 100KB)
    pub fn init_spin_comp_def(ctx: Context<InitSpinCompDef>) -> Result<()> {
        // Use offchain storage - circuit will be fetched by MPC nodes
        // Circuit hosted at: https://github.com/TOBY0001/arcis-circuits
        init_comp_def(
            ctx.accounts,
            Some(CircuitSource::OffChain(OffChainCircuitSource {
                source: "https://raw.githubusercontent.com/TOBY0001/arcis-circuits/main/spin.arcis".to_string(),
                hash: [0; 32], // Hash verification not enforced yet
            })),
            None,
        )?;
        Ok(())
    }

    /// Spin the wheel with encrypted randomization
    pub fn spin(
        ctx: Context<Spin>,
        computation_offset: u64,
        num_segments: u8,
        pub_key: [u8; 32],
        nonce: u128,
    ) -> Result<()> {
        // Circuit has user: Shared parameter, so we must provide encryption context
        // Pattern: x25519_pubkey, nonce, then other arguments
        let args = ArgBuilder::new()
            .x25519_pubkey(pub_key)
            .plaintext_u128(nonce)
            .plaintext_u8(num_segments)
            .build();
        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![SpinCallback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[]
            )?],
            1, // num_callback_txs
            0, // cu_price_micro: priority fee in microlamports (0 = no priority fee)
        )?;

        Ok(())
    }

    /// Handles the result of the wheel spin MPC computation.
    #[arcium_callback(encrypted_ix = "spin")]
    pub fn spin_callback(
        ctx: Context<SpinCallback>,
        output: SignedComputationOutputs<SpinOutput>,
    ) -> Result<()> {
        // verify_output() validates the BLS signature from the MXE cluster
        let result = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account
        ) {
            Ok(SpinOutput { field_0 }) => {
                // Access the encrypted value from the ciphertexts array
                // The actual decryption happens off-chain in the client
                field_0.ciphertexts[0]
            },
            Err(e) => {
                msg!("Computation verification failed: {}", e);
                return Err(ErrorCode::AbortedComputation.into())
            },
        };

        emit!(SpinEvent { result });

        Ok(())
    }
}

#[queue_computation_accounts("spin", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64, num_segments: u8, pub_key: [u8; 32], nonce: u128)]
pub struct Spin<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [b"ArciumSignerAccount"],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Account<'info, MXEAccount>,
    #[account(
        mut,
        address = derive_mempool_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: mempool_account, checked by the arcium program
    pub mempool_account: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: executing_pool, checked by the arcium program
    pub executing_pool: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_comp_pda!(
            computation_offset,
            mxe_account,
            ErrorCode::ClusterNotSet
        )
    )]
    /// CHECK: computation_account, checked by the arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(
        address = derive_comp_def_pda!(COMP_DEF_OFFSET_SPIN)
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    pub cluster_account: Account<'info, Cluster>,
    #[account(
        mut,
        address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS,
    )]
    pub pool_account: Account<'info, FeePool>,
    #[account(
        mut,
        address = ARCIUM_CLOCK_ACCOUNT_ADDRESS,
    )]
    pub clock_account: Account<'info, ClockAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[callback_accounts("spin")]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct SpinCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(
        address = derive_comp_def_pda!(COMP_DEF_OFFSET_SPIN)
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    pub cluster_account: Account<'info, Cluster>,
    #[account(
        mut,
        address = derive_comp_pda!(
            computation_offset,
            mxe_account,
            ErrorCode::ClusterNotSet
        )
    )]
    /// CHECK: computation_account, checked by the arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Account<'info, MXEAccount>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint
    pub instructions_sysvar: AccountInfo<'info>,
}

#[init_computation_definition_accounts("spin", payer)]
#[derive(Accounts)]
pub struct InitSpinCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        address = derive_mxe_pda!(),
    )]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    /// Can't check it here as it's not initialized yet.
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: address_lookup_table, checked by arcium program.
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut_program is the Address Lookup Table program.
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

/// Event emitted when a wheel spin completes.
#[event]
pub struct SpinEvent {
    /// The encrypted result segment of the wheel spin (1-N where N is num_segments)
    /// This will be decrypted by the client off-chain
    pub result: [u8; 32],
}


#[error_code]
pub enum ErrorCode {
    #[msg("The computation was aborted")]
    AbortedComputation,
    #[msg("The cluster is not set")]
    ClusterNotSet,
}