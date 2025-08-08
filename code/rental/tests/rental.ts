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
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import { expect } from "chai";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

const provider = anchor.AnchorProvider.env();
const RENT_FEE = new anchor.BN(5);
const DEPOSIT_FEE = new anchor.BN(4);

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

  // describe("List cars",async()=>{

  it("Check Pda state", async () => {
    try {
      // console.log("owner:", owner.publicKey);
      // console.log("carNftMint:", car_nft_mint.publicKey);
      // console.log("collectionMint:", collection_mint.publicKey);
      // console.log("rentalState:", rental_state.toBase58());
      // console.log("ownerNftAccount:", owner_ata.toBase58());
      // console.log("vault:", vault_ata);
      // console.log("systemProgram:", anchor.web3.SystemProgram.programId);
      // console.log("tokenProgram:", TOKEN_PROGRAM_ID);
      // console.log("associatedTokenProgram:", ASSOCIATED_TOKEN_PROGRAM_ID);
      // console.log("metadata:", nftmetadata[0]);
      // console.log("masterEdition:", masterEditionPda[0]);
      // console.log("metadataProgram:", MPL_TOKEN_METADATA_PROGRAM_ID);

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

      const state_data = await program.account.rentalState.fetch(rental_state);

      expect(state_data.owner.toString()).to.equal(
        new anchor.web3.PublicKey(owner.publicKey).toString()
      );
    } catch (error) {
      console.log(error);
      throw error;
    }
  });
});
