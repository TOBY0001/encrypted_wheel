use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

const COMP_DEF_OFFSET_SPIN: u32 = comp_def_offset("spin");

declare_id!("ArsdHhJ73uQigxswkkiENxDGfiFGodZZsvcXQxB39vWH");

#[arcium_program]
pub mod encrypted_wheel {
    use super::*;

    /// Initializes the computation definition for the wheel spin operation.
    pub fn init_spin_comp_def(ctx: Context<InitSpinCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, 0, None, None)?;
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
        // Pattern: ArcisPubkey, nonce, then other arguments
        let args = vec![
            Argument::ArcisPubkey(pub_key),
            Argument::PlaintextU128(nonce),
            Argument::PlaintextU8(num_segments),
        ];

        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            None,
            vec![SpinCallback::callback_ix(&[])],
            1, // num_callback_txs
        )?;

        Ok(())
    }

    /// Handles the result of the wheel spin MPC computation.
    #[arcium_callback(encrypted_ix = "spin")]
    pub fn spin_callback(
        ctx: Context<SpinCallback>,
        output: ComputationOutputs<SpinOutput>,
    ) -> Result<()> {
        let result = match output {
            ComputationOutputs::Success(SpinOutput { field_0 }) => {
                // Access the encrypted value from the ciphertexts array
                // The actual decryption happens off-chain in the client
                field_0.ciphertexts[0]
            },
            _ => return Err(ErrorCode::AbortedComputation.into()),
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
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, SignerAccount>,
    #[account(
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Account<'info, MXEAccount>,
    #[account(
        mut,
        address = derive_mempool_pda!()
    )]
    /// CHECK: mempool_account, checked by the arcium program
    pub mempool_account: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_execpool_pda!()
    )]
    /// CHECK: executing_pool, checked by the arcium program
    pub executing_pool: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_comp_pda!(computation_offset)
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
        address = ARCIUM_CLOCK_ACCOUNT_ADDRESS,
    )]
    pub clock_account: Account<'info, ClockAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[callback_accounts("spin")]
#[derive(Accounts)]
pub struct SpinCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(
        address = derive_comp_def_pda!(COMP_DEF_OFFSET_SPIN)
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
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
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    /// Can't check it here as it's not initialized yet.
    pub comp_def_account: UncheckedAccount<'info>,
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