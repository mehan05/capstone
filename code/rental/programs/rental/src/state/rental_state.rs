use anchor_lang::prelude::*;
#[derive(AnchorSerialize,AnchorDeserialize,Clone,PartialEq)]
pub enum StatusData{
    Active,
    Dispute,
    Finished
}

//because normal inbuild types like Pubkey, u32 are have implemented
//anchorlang::space but custom type like enum dosent have it so this.
impl anchor_lang::Space for StatusData{
    const INIT_SPACE:usize= 1;
}

#[account]
#[derive(InitSpace)]
pub struct RentalState {
    pub owner:Pubkey,
    pub renter:Option<Pubkey>,
    pub car_nft_mint:Pubkey,
    pub rent_fee:u64,
    pub rental_duration:Option<i64>,
    pub rental_start_time:Option<i64>,
    pub deposit_amount:u64,
    pub rental_bump:u8,
    pub listed:bool,
    pub rented:bool,
    pub status:StatusData,
    pub dispute_caller:Option<Pubkey>,
    pub test_num:Option<u64>
}
