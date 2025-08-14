use anchor_lang::prelude::*;
#[error_code]
pub enum ErrorCode{
    #[msg("car not listed")]
    CarNotListed,

    #[msg("Rental Period Not end")]
    RentalPeriodNotEnd,

    #[msg("Insufficient funds")]
    InsufficientFunds,

    #[msg("Car already rented")]
    CarAlreadyRented,

    #[msg("Values Overflow Error")]
    ValueOverflow,

    #[msg("Invalid Renter")]
    InvalidRenter,


    #[msg("Dispute already initiated")]
    DisputeAlreadyInitiated,

    #[msg("Invalid Payout")]
    InvalidPayout,

    #[msg("Dispute not initiated")]
    DisputeNotInitiated
}

