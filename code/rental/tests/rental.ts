import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Rental } from "../target/types/rental";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  createSignerFromKeypair,
  generateSigner,
  keypairIdentity,
  percentAmount,
  publicKey,
} from "@metaplex-foundation/umi";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, Signer } from "@solana/web3.js";
import {
  createNft,
  findMasterEditionPda,
  findMetadataPda,
  Key,
  MPL_TOKEN_METADATA_PROGRAM_ID,
  mplTokenMetadata,
  verifySizedCollectionItem,
} from "@metaplex-foundation/mpl-token-metadata";
import {
  createMint,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { expect } from "chai";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { SYSTEM_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/native/system";

const provider = anchor.AnchorProvider.env();
const RENT_FEE = new anchor.BN(5);
const DEPOSIT_FEE = new anchor.BN(4);
const RENTAL_DURATION = 300;

const create_ata = async (
  mint: PublicKey,
  owner: PublicKey,
  allowOffCurveAta: boolean
) => {
  try {
    const ata = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mint,
      owner,
      allowOffCurveAta
    );

    // console.log("vault ata", ata.address);

    return ata.address;
  } catch (error) {
    console.log(error);
  }
};
const airdrop_rent_token = async (
  to: PublicKey,
  amount: number,
  rent_fee_mint: PublicKey
) => {
  try {
    let tx = await mintTo(
      provider.connection,
      provider.wallet.payer,
      rent_fee_mint,
      to,
      provider.wallet.payer,
      amount
    );
  } catch (error) {
    console.log(error);
    throw error;
  }
};
const convert_keypair_to_anchor_compatiable = (keypair: any) => {
  return anchor.web3.Keypair.fromSecretKey(new Uint8Array(keypair.secretKey));
};

const transfer_sol = async (amount: number, to: anchor.web3.PublicKey) => {
  let tx = new anchor.web3.Transaction().add(
    anchor.web3.SystemProgram.transfer({
      fromPubkey: provider.publicKey,
      toPubkey: to,
      lamports: amount * LAMPORTS_PER_SOL,
    })
  );

  await provider.sendAndConfirm(tx, [provider.wallet.payer]);
};

describe("rental", async () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.rental as Program<Rental>;
  let connection = provider.connection;
  let umi = createUmi(connection);
  let payer = provider.wallet;

  let payerWallet = umi.eddsa.createKeypairFromSecretKey(
    new Uint8Array(payer.payer.secretKey)
  );
  let paySigner = createSignerFromKeypair(umi, payerWallet);

  let car_nft_mint = generateSigner(umi);
  let collection_mint = generateSigner(umi);
  let rent_fee_mint: any;

  // console.log("rent fee mint", rent_fee_mint);

  let owner: any;
  let renter: any;
  let malicious_user = Keypair.generate();

  let rental_state: anchor.web3.PublicKey;

  let vault_ata: any;
  // let vault_ata: anchor.web3.PublicKey;
  let rent_vault_ata: any;

  let owner_ata: anchor.web3.PublicKey;
  let renter_ata: anchor.web3.PublicKey;
  let owner_fee_ata: anchor.web3.PublicKey;
  let renter_fee_ata: anchor.web3.PublicKey;
  let malicious_user_ata: anchor.web3.PublicKey;
  let nftmetadata: any;
  let masterEditionPda: any;

  before(async () => {
    try {
      umi.use(keypairIdentity(paySigner));
      umi.use(mplTokenMetadata());

      owner = createSignerFromKeypair(umi, generateSigner(umi));
      renter = createSignerFromKeypair(umi, generateSigner(umi));

      rent_fee_mint = await createMint(
        connection,
        convert_keypair_to_anchor_compatiable(paySigner),
        new anchor.web3.PublicKey(paySigner.publicKey),
        null,
        9
      );

      await transfer_sol(2, new anchor.web3.PublicKey(owner.publicKey));
      await transfer_sol(2, new anchor.web3.PublicKey(renter.publicKey));

      await createNft(umi, {
        mint: collection_mint,
        name: "rental_collection",
        symbol: "RC",
        uri: "https://arweave.net/123",
        sellerFeeBasisPoints: percentAmount(0),
        collectionDetails: { __kind: "V1", size: 100 },
      }).sendAndConfirm(umi);

      await createNft(umi, {
        mint: car_nft_mint,
        name: "Konessige",
        symbol: "KO",
        uri: "https://arweave.net/123",
        sellerFeeBasisPoints: percentAmount(0),
        collection: { verified: false, key: collection_mint.publicKey },
        tokenOwner: owner.publicKey,
      }).sendAndConfirm(umi);

      let collectionMetadata = findMetadataPda(umi, {
        mint: collection_mint.publicKey,
      });
      nftmetadata = findMetadataPda(umi, { mint: car_nft_mint.publicKey });

      const collectionMasterEditionPda = findMasterEditionPda(umi, {
        mint: collection_mint.publicKey,
      });

      masterEditionPda = findMasterEditionPda(umi, {
        mint: car_nft_mint.publicKey,
      });

      await verifySizedCollectionItem(umi, {
        metadata: nftmetadata,
        collection: collectionMetadata,
        collectionMasterEditionAccount: collectionMasterEditionPda,
        collectionMint: collection_mint.publicKey,
        collectionAuthority: paySigner,
      }).sendAndConfirm(umi);

      owner_ata = await create_ata(
        new PublicKey(car_nft_mint.publicKey),
        new anchor.web3.PublicKey(owner.publicKey),
        false
      );

      console.log("owner ata created", owner_ata);

      renter_ata = await create_ata(
        new PublicKey(car_nft_mint.publicKey),
        new anchor.web3.PublicKey(renter.publicKey),
        false
      );

      rental_state = anchor.web3.PublicKey.findProgramAddressSync(
        [
          Buffer.from("rental"),
          new anchor.web3.PublicKey(car_nft_mint.publicKey).toBuffer(),
          new anchor.web3.PublicKey(owner.publicKey).toBuffer(),
        ],
        program.programId
      )[0];

      console.log("renter ata created", renter_ata);

      malicious_user_ata = await create_ata(
        new PublicKey(car_nft_mint.publicKey),
        new anchor.web3.PublicKey(malicious_user.publicKey),
        false
      );

      console.log("malicious user ata created", malicious_user_ata);

      let create_rent_ata = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        provider.wallet.payer,
        new anchor.web3.PublicKey(rent_fee_mint),
        new anchor.web3.PublicKey(renter.publicKey),
        false
      );

      renter_fee_ata = create_rent_ata.address;

      console.log("renter fee ata", renter_fee_ata);

      let create_ata_address = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        provider.wallet.payer,
        new anchor.web3.PublicKey(car_nft_mint.publicKey),
        new anchor.web3.PublicKey(rental_state),
        true
      );
      console.log("vault ata test", create_ata_address);
      vault_ata = create_ata_address.address;

      let rent_vault_ata_address = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        provider.wallet.payer,
        new anchor.web3.PublicKey(rent_fee_mint),
        new anchor.web3.PublicKey(rental_state),
        true
      );

      rent_vault_ata = rent_vault_ata_address.address;

      console.log("vault ata", vault_ata);

      let create_owner_fee_ata = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        provider.wallet.payer,
        new anchor.web3.PublicKey(rent_fee_mint),
        new anchor.web3.PublicKey(owner.publicKey),
        false
      );

      owner_fee_ata = create_owner_fee_ata.address;

      console.log("owner fee ata", owner_fee_ata);
    } catch (error) {
      console.log(error);
      throw error;
    }
  });

  describe("List cars", async () => {
    before(async () => {
      await program.methods
        .listCar(RENT_FEE, DEPOSIT_FEE)
        .accountsStrict({
          owner: new anchor.web3.PublicKey(owner.publicKey),
          carNftMint: new anchor.web3.PublicKey(car_nft_mint.publicKey),
          collectionMint: new anchor.web3.PublicKey(collection_mint.publicKey),
          rentalState: rental_state,
          ownerNftAccount: owner_ata,
          vault: vault_ata,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          metadata: new anchor.web3.PublicKey(nftmetadata[0]),
          masterEdition: masterEditionPda[0],
          metadataProgram: MPL_TOKEN_METADATA_PROGRAM_ID,
        })
        .signers([convert_keypair_to_anchor_compatiable(owner)])
        .rpc();
    });

    describe("Checking Pda state and Vault", async () => {
      it("Check Pda state", async () => {
        const state_data = await program.account.rentalState.fetch(
          rental_state
        );

        expect(state_data.owner.toString()).to.equal(
          new anchor.web3.PublicKey(owner.publicKey).toString()
        );
      });

      it("Check Nft transfered from owner to vault", async () => {
        let vault_ata_balance = await getAccount(
          provider.connection,
          vault_ata
        );
        let owner_ata_balance = await getAccount(
          provider.connection,
          owner_ata
        );

        expect(vault_ata_balance.amount.toString()).to.equal("1");
        expect(owner_ata_balance.amount.toString()).to.equal("0");
      });
    });
  });

  describe("Rent Car", async () => {
    before(async () => {
      let amount = RENT_FEE.toNumber() + DEPOSIT_FEE.toNumber();
      await airdrop_rent_token(renter_fee_ata, amount, rent_fee_mint);

      await program.methods
        .rentCar(new anchor.BN(RENTAL_DURATION))
        .accountsStrict({
          owner: new anchor.web3.PublicKey(owner.publicKey),
          carNftMint: new anchor.web3.PublicKey(car_nft_mint.publicKey),
          rentVault: rent_vault_ata,
          renter: new anchor.web3.PublicKey(renter.publicKey),
          rentFeeMint: new anchor.web3.PublicKey(rent_fee_mint),
          renterAta: renter_fee_ata,
          rentalState: rental_state,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([convert_keypair_to_anchor_compatiable(renter)])
        .rpc();
    });

    describe("Check Rent Fee and Pda State Update", async () => {
      it("Checking Rent Fee is transferred to Contract", async () => {
        let rent_vault_ata_balance = await getAccount(
          provider.connection,
          rent_vault_ata
        );

        expect(rent_vault_ata_balance.amount.toString()).to.equal(
          RENT_FEE.add(DEPOSIT_FEE).toString()
        );
      });

      it("Checking Pda State is updated", async () => {
        const state_data = await program.account.rentalState.fetch(
          rental_state
        );

        expect(state_data.rentalDuration.toString()).to.equal(
          RENTAL_DURATION.toString()
        );

        expect(state_data.renter.toString()).to.equal(
          new anchor.web3.PublicKey(renter.publicKey).toString()
        );

        expect(state_data.rented).to.equal(true);

        expect(state_data.rentalStartTime.toString()).to.not.equal(0);
      });
    });
  });

  describe("Return Car", async () => {
    before(async () => {
      await program.methods
        .endRental()
        .accountsStrict({
          owner: new anchor.web3.PublicKey(owner.publicKey),
          renter: new anchor.web3.PublicKey(renter.publicKey),
          collectionMint: new anchor.web3.PublicKey(collection_mint.publicKey),
          carNftMint: new anchor.web3.PublicKey(car_nft_mint.publicKey),
          rentFeeMint: new anchor.web3.PublicKey(rent_fee_mint),
          rentalState : rental_state,
          rentVault : rent_vault_ata,
          vault: vault_ata,
          metadata: new anchor.web3.PublicKey(nftmetadata[0]),
          masterEdition: masterEditionPda[0],
          renterAta: renter_fee_ata,
          ownerAta: owner_ata,
          ownerFeeAta: owner_fee_ata,
          systemProgram: SYSTEM_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
          metadataProgram: MPL_TOKEN_METADATA_PROGRAM_ID,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        })
        .signers([
          convert_keypair_to_anchor_compatiable(renter),
          convert_keypair_to_anchor_compatiable(owner),
        ])
        .rpc();
    });

    describe("Checking transfer of funds and NFT", async () => {
      it("Checking NFT transferred to owner", async () => {
        let owner_ata_info = await getAccount(provider.connection, owner_ata);

        let vault_ata_info = await getAccount(provider.connection, vault_ata);

        expect(owner_ata_info.amount.toString()).to.equal("1");
        expect(vault_ata_info.amount.toString()).to.equal("0");
      });

      it("checking deposit fee transferred to renter", async () => {
        let renter_ata_info = await getAccount(
          provider.connection,
          renter_fee_ata
        );
        let vault_ata_balance = await getAccount(
          provider.connection,
          rent_vault_ata
        );

        expect(renter_ata_info.amount.toString()).to.equal(
          (Number(renter_ata_info.amount) + DEPOSIT_FEE.toNumber()).toString()
        );
        expect(vault_ata_balance.amount.toString()).to.equal(
          (Number(renter_ata_info.amount) - DEPOSIT_FEE.toNumber()).toString()
        );
      });

      it("Checking transfer rent to owner", async () => {
        let owner_ata_balance = await getAccount(
          provider.connection,
          owner_fee_ata
        );

        let vault_ata_balance = await getAccount(
          provider.connection,
          rent_vault_ata
        );

        expect(owner_ata_balance.amount.toString()).to.equal(
          (Number(owner_ata_balance.amount) + RENT_FEE.toNumber()).toString()
        );
        expect(vault_ata_balance.amount.toString()).to.equal(
          (Number(owner_ata_balance.amount) - RENT_FEE.toNumber()).toString()
        );

      });
    });
  });
});
