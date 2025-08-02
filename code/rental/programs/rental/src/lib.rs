use anchor_lang::prelude::*;

declare_id!("5cNB4vSVibYZoma2BiDDtK1UQEEJdpL6WTUj3hzTRhao");

pub mod errors;
pub mod state;
pub mod constants;
pub mod instructions;

pub use errors::*;
pub use state::*;
pub use constants::*;
pub use instructions::*;

#[program]
pub mod rental {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
