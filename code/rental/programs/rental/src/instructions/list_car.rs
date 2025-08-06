use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken, metadata::{MasterEditionAccount, Metadata, MetadataAccount}, token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked}
};

use crate::{state::*,errors::*, constants::*};


#[derive(Accounts)]
pub struct ListCar<'info>{

    #[account(mut)]
    pub owner:Signer<'info>,

    pub car_nft_mint:InterfaceAccount<'info,Mint>,

    pub collection_mint:InterfaceAccount<'info,Mint>,

    #[account(
        init,
        payer = owner,
        space = DISCRIMINATOR + RentalState::INIT_SPACE,
        seeds = [b"rental", car_nft_mint.key().as_ref(),owner.key().as_ref()],
        bump
    )]
    pub rental_state:Account<'info,RentalState>,

    #[account(
        init,
        payer = owner,
        associated_token::mint = car_nft_mint,
        associated_token::authority = owner
    )]
    pub owner_nft_account:InterfaceAccount<'info,TokenAccount>,

    #[account(
        init,
        payer = owner,
        associated_token::mint = car_nft_mint,
        associated_token::authority = rental_state
    )]
    pub vault:InterfaceAccount<'info,TokenAccount>,

    #[account(
        seeds=[
            b"metadata",
            metadata_program.key().as_ref(),
            car_nft_mint.key().as_ref()
        ],
        seeds::program = metadata_program.key(),
        bump,
        constraint = metadata.collection.as_ref().unwrap().key.as_ref() == collection_mint.key().as_ref(),
        constraint = metadata.collection.as_ref().unwrap().verified == true
    )]
    pub metadata:Account<'info,MetadataAccount>,

    #[account(
        seeds=[b"metadata",metadata_program.key().as_ref(),car_nft_mint.key().as_ref()],
        seeds::program = metadata_program.key(),
        bump
    )]
    pub master_edition:Account<'info,MasterEditionAccount>,

    pub system_program:Program<'info,System>,
    pub associated_token_program:Program<'info,AssociatedToken>,
    pub token_program:Interface<'info,TokenInterface>,
    pub metadata_program:Program<'info,Metadata>,
    pub clock:Sysvar<'info,Clock>

}

impl<'info> ListCar<'info>{
    pub fn list_car(&mut self,rent_fee:u64,  deposit_amount:u64, bumps:ListCarBumps)->Result<()>{

        self.update_state(rent_fee,deposit_amount,bumps)?;

        self.transfer_nft()?;

        Ok(())

    }

    pub fn update_state(&mut self,rent_fee:u64,  deposit_amount:u64, bumps:ListCarBumps)->Result<()>{

        self.rental_state.set_inner(RentalState{
            owner:self.owner.key(),
            renter:None,
            rental_duration:None,
            car_nft_mint:self.car_nft_mint.key(),
            rent_fee,
            rental_start_time:None,
            deposit_amount,
            rental_bump : bumps.rental_state,
            listed:true,
            rented:false,
        });

        Ok(())
    }

    pub fn transfer_nft(&mut self)->Result<()>{

        let cpi_program = self.token_program.to_account_info();

        let cpi_accounts = TransferChecked{
            from:self.owner.to_account_info(),
            to:self.vault.to_account_info(),
            mint:self.car_nft_mint.to_account_info(),
            authority:self.owner.to_account_info()
        };

        let ctx = CpiContext::new(cpi_program,cpi_accounts);

        transfer_checked(ctx, 1,self.car_nft_mint.decimals)?;

        Ok(())
    }
}
