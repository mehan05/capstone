use anchor_lang::{prelude::*, system_program::transfer,InstructionData};
use anchor_spl::{
    associated_token::AssociatedToken, metadata::{MasterEditionAccount, Metadata, MetadataAccount}, token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked}
};

use crate::{state::*,errors::ErrorCode, constants::*};


#[derive(Accounts)]
pub struct EndRental<'info>{
    #[account(mut)]
    pub owner:Signer<'info>,


    #[account(mut)]
    pub renter:Signer<'info>,

    pub collection_mint:InterfaceAccount<'info,Mint>,

    pub car_nft_mint:InterfaceAccount<'info,Mint>,
    pub rent_fee_mint:InterfaceAccount<'info,Mint>,

      #[account(
        mut,
        seeds=[b"rental", car_nft_mint.key().as_ref(), owner.key().as_ref()],
        bump = rental_state.rental_bump
    )]
    pub rental_state:Account<'info,RentalState>,

    #[account(
        mut,
        associated_token::mint = rent_fee_mint,
        associated_token::authority = rental_state,
    )]
    pub rent_vault:InterfaceAccount<'info,TokenAccount>,

    #[account(
        mut,
        associated_token::mint = car_nft_mint,
        associated_token::authority = rental_state,
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
        constraint = metadata.collection.as_ref().unwrap().verified == true,
    )]
    pub metadata:InterfaceAccount<'info,MetadataAccount>,

    #[account(
        seeds=[
            b"metadata",
            metadata_program.key().as_ref(),
            car_nft_mint.key().as_ref()
        ],
        seeds::program = metadata_program.key(),
        bump
    )]
    pub master_edition:InterfaceAccount<'info,MasterEditionAccount>,

       

        #[account(
        mut,
        associated_token::mint = rent_fee_mint,
        associated_token::authority = renter,
    )]
    pub renter_ata:InterfaceAccount<'info,TokenAccount>,


    pub system_program:Program<'info,System>,
    pub associated_token_program:Program<'info,AssociatedToken>,
    pub token_program:Program<'info,TokenInterface>,
    pub metadata_program:Program<'info,Metadata>
}

impl<'info> EndRental<'info>{
    pub fn end_rental(&mut self, deposit_amount:u64, to:Pubkey)->Result<()>{

        let current_time  = Clock::get()?;
     
        require!(current_time.unix_timestamp >= self.rental_state.rental_start_time.unwrap(),ErrorCode::RentalPeriodNotEnd);

        require!(deposit_amount <= self.rental_state.deposit_amount,ErrorCode::InsufficientFunds);
     
        require!(current_time.unix_timestamp >= self.rental_state.rental_start_time.unwrap(),ErrorCode::RentalPeriodNotEnd);
  //sending nft to owner
        self.transfer_generic(1, self.car_nft_mint.to_account_info(), self.owner.to_account_info(), self.vault.to_account_info())?;

        //sending deposit to renter
        self.transfer_generic(deposit_amount,self.rent_fee_mint.to_account_info(), self.renter_ata.to_account_info(), self.rent_vault.to_account_info())?;

        //sending rent to owner
        self.transfer_generic(self.rental_state.rent_fee,self.rent_fee_mint.to_account_info(), self.rent_vault.to_account_info(),self.owner.to_account_info())?;

        self.rental_state.rental_duration = None;
        self.rental_state.renter = None;
        self.rental_state.rented = false;

        Ok(())
    
    }

    pub fn transfer_generic(&mut self, amount:u64, mint:AccountInfo<'info>, to:AccountInfo<'info>, from:AccountInfo<'info>)->Result<()>{
        let cpi_program = self.token_program.to_account_info();

        let cpi_accounts = TransferChecked{
            from:from.to_account_info(),
            to:to.to_account_info(),
            mint:mint.to_account_info(),
            authority:self.owner.to_account_info()
        };

        let car_nft_mint = self.car_nft_mint.key();
        let owner = self.owner.key();
        let seeds  =[
            b"rental",
            car_nft_mint.as_ref(),
            owner.as_ref(),
            &[self.rental_state.rental_bump]
        ];

        let signer_seed = &[&seeds[..]];

        let ctx = CpiContext::new_with_signer(cpi_program,cpi_accounts,signer_seed);

        transfer_checked(ctx, amount,6);

        Ok(())
    }
}