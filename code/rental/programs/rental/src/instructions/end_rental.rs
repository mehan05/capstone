use anchor_lang::{prelude::*};
use anchor_spl::{
    associated_token::AssociatedToken, metadata::{MasterEditionAccount, Metadata, MetadataAccount},
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked}
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
        bump = rental_state.rental_bump,
        has_one=owner,
        close=owner
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
    pub metadata:Account<'info,MetadataAccount>,

    #[account(
        seeds=[
            b"metadata",
            metadata_program.key().as_ref(),
            car_nft_mint.key().as_ref()
        ],
        bump,
        seeds::program = metadata_program.key()
    )]
    pub master_edition:Account<'info,MasterEditionAccount>,

        #[account(
        mut,
        associated_token::mint = rent_fee_mint,
        associated_token::authority = renter,
    )]
    pub renter_ata:InterfaceAccount<'info,TokenAccount>,

      #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = rent_fee_mint,
        associated_token::authority = renter,
    )]
    pub owner_ata:InterfaceAccount<'info,TokenAccount>,

      #[account(
        init_if_needed,
        payer = renter,
        associated_token::mint = rent_fee_mint,
        associated_token::authority = renter,
    )]
    pub owner_fee_ata:InterfaceAccount<'info,TokenAccount>,

    pub system_program:Program<'info,System>,
    pub associated_token_program:Program<'info,AssociatedToken>,
    pub token_program:Interface<'info,TokenInterface>,
    pub metadata_program:Program<'info,Metadata>,
    pub clock:Sysvar<'info,Clock>,
}

impl<'info> EndRental<'info>{
    pub fn end_rental(&mut self)->Result<()>{

        let current_time  = Clock::get()?;
        
        if self.rental_state.renter!=Some(self.renter.key())
        {return Err(ErrorCode::InvalidRenter.into())}

        require!(current_time.unix_timestamp >= self.rental_state.rental_start_time.unwrap(),ErrorCode::RentalPeriodNotEnd);

        //sending nft to owner
        self.transfer_generic(1, self.car_nft_mint.to_account_info(), self.owner_ata.to_account_info(), self.vault.to_account_info(),self.rental_state.to_account_info(),self.car_nft_mint.decimals)?;

        //sending deposit to renter
        self.transfer_generic(self.rental_state.deposit_amount,self.rent_fee_mint.to_account_info(), self.renter_ata.to_account_info(), self.rent_vault.to_account_info(),self.rental_state.to_account_info(),self.rent_fee_mint.decimals)?;

        //sending rent to owner
        self.transfer_generic(self.rental_state.rent_fee,self.rent_fee_mint.to_account_info(), self.rent_vault.to_account_info(),self.owner_ata.to_account_info(),self.owner_fee_ata.to_account_info(),self.rent_fee_mint.decimals)?;

        self.rental_state.rental_duration = None;
        self.rental_state.renter = None;
        self.rental_state.rented = false;

        Ok(())
    
    }

    pub fn transfer_generic(&mut self, amount:u64, mint:AccountInfo<'info>, to:AccountInfo<'info>, from:AccountInfo<'info>,authority:AccountInfo<'info>,decimals:u8)->Result<()>{
        let cpi_program = self.token_program.to_account_info();

        let cpi_accounts = TransferChecked{
            from:from.to_account_info(),
            to:to.to_account_info(),
            mint:mint.to_account_info(),
            authority:authority.to_account_info()
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

        transfer_checked(ctx, amount,decimals)?;

        Ok(())
    }
}