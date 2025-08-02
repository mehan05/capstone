use anchor_lang::prelude::*;
#[error_code]
pub enum ErrorCode{
    #[msg("car not listed")]
    CarNotListed,

    #[msg("Rental Period Not end")]
    RentalPeriodNotEnd,

    #[msg("Insufficient funds")]
    InsufficientFunds
}

