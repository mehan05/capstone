use anchor_lang::{prelude::*};
use anchor_spl::{
    associated_token::AssociatedToken, metadata::{MasterEditionAccount, Metadata, MetadataAccount}, 
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked}
};

use crate::{state::*,errors::ErrorCode, constants::*};

#[derive(Accounts)]
pub struct EmergencyExit<'info> {

    #[account(mut)]
    pub owner:Signer<'info>,

    #[account(mut)]
    pub renter:Signer<'info>,


    #[account(mut)]
    pub arbitrator:Signer<'info>,

     pub collection_mint:InterfaceAccount<'info,Mint>,

    pub car_nft_mint:InterfaceAccount<'info,Mint>,
    pub rent_fee_mint:InterfaceAccount<'info,Mint>,


    #[account(
        mut,
        seeds=[b"rental", car_nft_mint.key().as_ref(), owner.key().as_ref()],
        has_one = owner,
        bump = rental_state.rental_bump,
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
            car_nft_mint.key().as_ref(),
            b"edition"
        ],
        seeds::program = metadata_program.key(),
        bump
    )]
    pub master_edition:Account<'info,MasterEditionAccount>,


    #[account(
        mut,
        associated_token::mint = rent_fee_mint,
        associated_token::authority = renter,
    )]
    pub renter_ata:InterfaceAccount<'info,TokenAccount>,

          #[account(
        mut,
        associated_token::mint = car_nft_mint,
        associated_token::authority = owner,
    )]
    pub owner_ata:InterfaceAccount<'info,TokenAccount>,

      #[account(
        mut,
        associated_token::mint = rent_fee_mint,
        associated_token::authority = owner,
    )]
    pub owner_fee_ata:InterfaceAccount<'info,TokenAccount>,


    pub system_program:Program<'info,System>,
    pub associated_token_program:Program<'info,AssociatedToken>,
    pub token_program:Interface<'info,TokenInterface>,
    pub metadata_program:Program<'info,Metadata>
}

impl<'info> EmergencyExit<'info>{

    pub fn exit_payout(&mut self, renter_payout:u64,owner_payout:u64)->Result<()>{
        self.rental_state.status = StatusData::Dispute;
         require!(self.rental_state.status == StatusData::Dispute, ErrorCode::DisputeNotInitiated);

    let total_in_escrow = self.rental_state.rent_fee.checked_add(self.rental_state.deposit_amount).unwrap();
    require!(renter_payout.checked_add(owner_payout).unwrap() <= total_in_escrow, ErrorCode::InvalidPayout);

        //sending nft to owner
           self.transfer_generic(
        1,
        self.car_nft_mint.to_account_info(),
        self.owner_ata.to_account_info(),      
        self.vault.to_account_info(),
        self.car_nft_mint.decimals,
        self.rental_state.to_account_info()
    )?;

         if owner_payout > 0 {
        self.transfer_generic(
            owner_payout,
            self.rent_fee_mint.to_account_info(),
            self.owner_fee_ata.to_account_info(), 
            self.rent_vault.to_account_info(),   
            self.rent_fee_mint.decimals,
            self.rental_state.to_account_info()
        )?;
    }
       
        if renter_payout > 0 {
        self.transfer_generic(
            renter_payout,
            self.rent_fee_mint.to_account_info(),
            self.renter_ata.to_account_info(),   
            self.rent_vault.to_account_info(),  
            self.rent_fee_mint.decimals,
            self.rental_state.to_account_info()
        )?;
    }
        self.rental_state.dispute_caller  =Some( self.arbitrator.key());
        self.rental_state.rental_duration = None;
        self.rental_state.renter = None;
        self.rental_state.rented = false;
        self.rental_state.status = StatusData::Finished;
        Ok(())
    
    }

    pub fn transfer_generic(&mut self, amount:u64, mint:AccountInfo<'info>, to:AccountInfo<'info>, from:AccountInfo<'info>,decimals:u8,authority:AccountInfo<'info>)->Result<()>{
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