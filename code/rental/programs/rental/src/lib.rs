use anchor_lang::prelude::*;

declare_id!("JAKF3KyxdugBwNSDqAWvFz92D6gDk7Yx7iu7sS6c5HhP");

pub mod errors;
pub mod state;
pub mod constants;
pub mod instructions;

pub use errors::*;
pub use state::*;
pub use constants::*;
pub use instructions::{list_car::*,end_rental::*,rent_car::*};

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


}

