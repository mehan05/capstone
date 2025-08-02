use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken, metadata::{MasterEditionAccount, Metadata, MetadataAccount}, token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked}
};

use crate::{state::*,errors::*, constants::*};

#[derive(Accounts)]
pub struct Rent_car<'info>{
    #[account(mut)]
    pub renter:Signer<'info>,

    #[account(mut)]
    pub owner:SystemAccount<'info>,

    pub car_nft_mint:InterfaceAccount<'info,Mint>,
    pub rent_fee_mint:InterfaceAccount<'info,Mint>,

    #[account(
        mut,
        seeds=[b"rental", car_nft_mint.key().as_ref(), owner.key().as_ref()],
        bump = rental_state.rental_bump
    )]
    pub rental_state:Account<'info,RentalState>,



    #[account(
        associated_token::mint = car_nft_mint,
        associated_token::authority = rental_state,
    )]
    pub vault:InterfaceAccount<'info,TokenAccount>,

    #[account(
        init_if_needed,
        payer = renter,
        associated_token::mint = rent_fee_mint,
        associated_token::authority = renter,
    )]
    pub renter_ata:InterfaceAccount<'info,TokenAccount>,

    
    #[account(
        init_if_needed,
        payer = renter,
        associated_token::mint = rent_fee_mint,
        associated_token::authority = renter,
    )]
    pub owner_ata:InterfaceAccount<'info,TokenAccount>,



    pub system_program:Program<'info,System>,

}