use anchor_lang::{prelude::*};
use anchor_spl::{
    associated_token::AssociatedToken, token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked}
};

use crate::{errors::ErrorCode, state::*,};


#[derive(Accounts)]
pub struct RentCar<'info>{
    #[account(mut)]
    pub renter:Signer<'info>,

    #[account(mut)]
    pub owner:SystemAccount<'info>,
    pub car_nft_mint:InterfaceAccount<'info,Mint>,

    pub rent_fee_mint:InterfaceAccount<'info,Mint>,

    #[account(
        seeds=[b"rental", car_nft_mint.key().as_ref(), owner.key().as_ref()],
        has_one = owner,
        bump = rental_state.rental_bump,
    )]
    pub rental_state:Account<'info,RentalState>,

    #[account(
        init_if_needed,
        payer = renter,
        associated_token::mint = rent_fee_mint,
        associated_token::authority = rental_state,
    )]
    pub rent_vault:InterfaceAccount<'info,TokenAccount>,


    #[account(
        init_if_needed,
        payer = renter,
        associated_token::mint = rent_fee_mint,
        associated_token::authority = renter,
    )]
    pub renter_ata:InterfaceAccount<'info,TokenAccount>,

    
  

    pub system_program:Program<'info,System>,
    pub associated_token_program:Program<'info,AssociatedToken>,
    pub token_program:Interface<'info,TokenInterface>,
    pub clock: Sysvar<'info,Clock>
}

impl<'info> RentCar<'info>{
    
  pub fn rent_car(&mut self,rental_duration:i64)->Result<()>{

    require!(self.rental_state.listed,ErrorCode::CarNotListed);
    require!(!self.rental_state.rented,ErrorCode::RentalPeriodNotEnd);

    self.transfer_rent_fee()?;    

    self.rental_state.rental_duration = Some(rental_duration);
    self.rental_state.renter = Some(self.renter.key());
    self.rental_state.rented = true;
    self.rental_state.rental_start_time = Some(self.clock.unix_timestamp);

    Ok(())
  }

  pub fn transfer_rent_fee(&mut  self)->Result<()>{

   let total_fee: u64 = self.rental_state.rent_fee.checked_add(self.rental_state.deposit_amount).ok_or(ErrorCode::ValueOverflow)?;

   let renter_balance = self.renter_ata.amount;

   require!(renter_balance>=total_fee,ErrorCode::InsufficientFunds);

   //getting rent fee
    let cpi_program = self.token_program.to_account_info();

    let cpi_accounts = TransferChecked{
        from:self.renter_ata.to_account_info(),
        to:self.rent_vault.to_account_info(),
        mint:self.rent_fee_mint.to_account_info(),
        authority:self.renter.to_account_info()
    };

    let ctx = CpiContext::new(cpi_program.clone(),cpi_accounts);

    transfer_checked(ctx, self.rental_state.rent_fee,self.rent_fee_mint.decimals)?;

    //getting deposit fee
    let cpi_accounts = TransferChecked{
        from:self.renter_ata.to_account_info(),
        to:self.rent_vault.to_account_info(),
        mint:self.rent_fee_mint.to_account_info(),
        authority:self.renter.to_account_info()
    };

    let ctx = CpiContext::new(cpi_program.clone(),cpi_accounts);

    transfer_checked(ctx, self.rental_state.deposit_amount,self.rent_fee_mint.decimals)?;

    Ok(())
  }



    
}

