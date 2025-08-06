use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct RentalState {
    pub car_owner:Pubkey,
    pub renter:Option<Pubkey>,
    pub car_nft_mint:Pubkey,
    pub rent_fee:u64,
    pub rental_duration:Option<i64>,
    pub rental_start_time:Option<i64>,
    pub deposit_amount:u64,
    pub rental_bump:u8,
    pub listed:bool,
    pub rented:bool
}
