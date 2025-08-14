use anchor_lang::prelude::*;

declare_id!("25bVatvSdtdnoWQN9XgTMhHAnZZcs6JJ5LVNPLEK8FwF");

pub mod errors;
pub mod state;
pub mod constants;
pub mod instructions;

pub use errors::*;
pub use state::*;
pub use constants::*;
pub use instructions::{list_car::*,end_rental::*,rent_car::*,emergency_exit::*};

#[program]
pub mod rental {

    use super::*;

    pub fn list_car(ctx:Context<ListCar>,rent_fee:u64,deposit_amount:u64)->Result<()>{
        ctx.accounts.list_car(rent_fee,deposit_amount,ctx.bumps)?;

        Ok(())
    }

    pub fn rent_car(ctx:Context<RentCar>,rental_duration:i64)->Result<()>{
        ctx.accounts.rent_car(rental_duration)?;
        Ok(())
    }

    pub fn end_rental(ctx:Context<EndRental>)->Result<()>{
        ctx.accounts.end_rental()?;
        Ok(())
    }

    pub fn emergency_exit(ctx:Context<EmergencyExit>,renter_payout:u64,owner_payout:u64)->Result<()>{
        ctx.accounts.exit_payout(renter_payout,owner_payout)?;

        
        Ok(())
    }


}

