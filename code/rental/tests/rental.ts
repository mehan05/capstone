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
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Signer,
  SYSVAR_CLOCK_PUBKEY,
  Transaction,
} from "@solana/web3.js";
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
import { TUKTUK_IDL } from "./tuktuk";
import { BN } from "bn.js";

const provider = anchor.AnchorProvider.env();
const RENT_FEE = new anchor.BN(5);
const DEPOSIT_FEE = new anchor.BN(4);
const RENTAL_DURATION = 300;
const TUKTUK_CONFIG_SEED = Buffer.from("tuktuk_config");
const TASK_QUEUE_SEED = Buffer.from("task_queue");
const TASK_QUEUE_AUTHORITY_SEED = Buffer.from("queue_authority");
const TASK_SEED = Buffer.from("task");

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
  const compileTxFunction = (data:any) => {
      const compiledTx = {
        accounts: [
          program.programId,
          owner,
          renter,
          collection_mint,
          car_nft_mint,
          rent_fee_mint,
          rental_state,
          rent_vault_ata,
          vault_ata,
          nftmetadata,
          masterEditionPda,
          renter_ata,
          owner_ata,
          owner_fee_ata,
          SYSTEM_PROGRAM_ID,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID,
          MPL_TOKEN_METADATA_PROGRAM_ID,
          SYSVAR_CLOCK_PUBKEY,
        ],
        instructions: [
          {
            programIdIndex: 0,
            accounts: [
              1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 15, 17, 18,
            ],
            data: data,
          },
        ],
        numRwSigners: 0,
        numRoSigners: 0,
        numRw: 10,
        signerSeeds: [],
      };

      return compiledTx;
  };

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
          rentFeeMint: new anchor.web3.PublicKey(rent_fee_mint),
          ownerFeeAta: new anchor.web3.PublicKey(owner_fee_ata),
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

    await setupTuktukQueue("end_rental");
  });

  describe("Return Car", async () => {
    let renter_ata_info_before;

    let owner_ata_balance_before;

    before(async () => {
      renter_ata_info_before = await getAccount(
        provider.connection,
        renter_fee_ata
      );

      owner_ata_balance_before = await getAccount(
        provider.connection,
        owner_fee_ata
      );

      // await program.methods
      //   .endRental()
      //   .accountsStrict({
      //     owner: new anchor.web3.PublicKey(owner.publicKey),
      //     renter: new anchor.web3.PublicKey(renter.publicKey),
      //     collectionMint: new anchor.web3.PublicKey(collection_mint.publicKey),
      //     carNftMint: new anchor.web3.PublicKey(car_nft_mint.publicKey),
      //     rentFeeMint: new anchor.web3.PublicKey(rent_fee_mint),
      //     rentalState: rental_state,
      //     rentVault: rent_vault_ata,
      //     vault: vault_ata,
      //     metadata: new anchor.web3.PublicKey(nftmetadata[0]),
      //     masterEdition: masterEditionPda[0],
      //     renterAta: renter_fee_ata,
      //     ownerAta: owner_ata,
      //     ownerFeeAta: owner_fee_ata,
      //     systemProgram: SYSTEM_PROGRAM_ID,
      //     associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      //     tokenProgram: TOKEN_PROGRAM_ID,
      //     metadataProgram: MPL_TOKEN_METADATA_PROGRAM_ID,
      //     clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      //   })
      //   .signers([
      //     convert_keypair_to_anchor_compatiable(renter),
      //     convert_keypair_to_anchor_compatiable(owner),
      //   ])
      //   .rpc();
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
          (
            Number(renter_ata_info_before.amount) + DEPOSIT_FEE.toNumber()
          ).toString()
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
          (
            Number(owner_ata_balance_before.amount) + RENT_FEE.toNumber()
          ).toString()
        );

        expect(vault_ata_balance.amount.toString()).to.equal("0");
      });
    });
  });

  //-----------------------------------------------------------------------------------------------------------------------------
  async function setupTuktukQueue(queueName: string) {

    console.log("\nSetting up Tuktuk Task Queue...");

    const keypairFromPayer = Keypair.fromSecretKey(
      new Uint8Array(paySigner.secretKey)
    );

    const tuktukProgram = new Program(TUKTUK_IDL, provider);

    const [tuktukConfigKey] = PublicKey.findProgramAddressSync(
      [TUKTUK_CONFIG_SEED],
      tuktukProgram.programId
    );

    const [taskQueueKey] = PublicKey.findProgramAddressSync(
      [TASK_QUEUE_SEED, Buffer.from(queueName)],
      tuktukProgram.programId
    );

    // Check if setup is already done
    const queueAccountInfo = await provider.connection.getAccountInfo(
      taskQueueKey
    );
    if (queueAccountInfo) {
      console.log(`Task Queue '${queueName}' already exists. Skipping setup.`);
      return taskQueueKey;
    }

    console.log("Performing one-time setup for Tuktuk Task Queue...");
    const setupTx = new Transaction();

    // Instruction 1: Initialize Tuktuk Config (if it doesn't exist)
    const configAccountInfo = await provider.connection.getAccountInfo(
      tuktukConfigKey
    );
    if (!configAccountInfo) {
      const initConfigIx = await tuktukProgram.methods
        .initializeTuktukConfigV0({
          minDeposit: new anchor.BN(0),
        })
        .accounts({
          tuktukConfig: tuktukConfigKey,
          payer: keypairFromPayer.publicKey,
          approver: keypairFromPayer.publicKey, // In a real scenario, this would be a separate, trusted authority
          authority: keypairFromPayer.publicKey,
          systemProgram: SYSTEM_PROGRAM_ID,
        })
        .instruction();
      setupTx.add(initConfigIx);
    }

    // Instruction 2: Initialize the Task Queue
    const initQueueIx = await tuktukProgram.methods
      .initializeTaskQueueV0({
        name: queueName,
        capacity: 100, // Max 100 tasks in queue
        minCrankReward: new BN(10000), // Small reward for the cranker
        staleTaskAge: 3600, // 1 hour
        lookupTables: [],
      })
      .accounts({
        taskQueue: taskQueueKey,
        tuktukConfig: tuktukConfigKey,
        payer: keypairFromPayer.publicKey,
        updateAuthority: keypairFromPayer.publicKey,
        systemProgram: SYSTEM_PROGRAM_ID,
        taskQueueNameMapping: PublicKey.default, // Not used in this version
      })
      .instruction();
    setupTx.add(initQueueIx);

    // Instruction 3: Add our wallet as an authority that can add tasks to this queue
    const [taskQueueAuthorityKey] = PublicKey.findProgramAddressSync(
      [
        TASK_QUEUE_AUTHORITY_SEED,
        taskQueueKey.toBuffer(),
        keypairFromPayer.publicKey.toBuffer(),
      ],
      tuktukProgram.programId
    );
    
    const addAuthIx = await tuktukProgram.methods
      .addQueueAuthorityV0()
      .accounts({
        taskQueueAuthority: taskQueueAuthorityKey,
        taskQueue: taskQueueKey,
        updateAuthority: keypairFromPayer.publicKey,
        queueAuthority: keypairFromPayer.publicKey,
        payer: keypairFromPayer.publicKey,
        systemProgram: SYSTEM_PROGRAM_ID,
      })
      .instruction();
    setupTx.add(addAuthIx);

    try {
      const txSignature = await provider.sendAndConfirm(setupTx, [
        keypairFromPayer,
      ]);
      console.log(
        `Setup complete! Transaction: https://explorer.solana.com/tx/${txSignature}?cluster=devnet`
      );
    } catch (err) {
      console.error("Error during setup:", err);
      throw err;
    }

    scheduleEndRental(taskQueueKey, tuktukProgram, keypairFromPayer);

    return taskQueueKey;
  }

  async function scheduleEndRental(
    taskQueueKey: PublicKey,
    tuktukProgram: any,
    keypair: any
  ) {
    console.log("\nScheduling an 'end_rental' task...");

    const tx_end_rental =   await program.methods
        .endRental()
        .accountsStrict({
          owner: new anchor.web3.PublicKey(owner.publicKey),
          renter: new anchor.web3.PublicKey(renter.publicKey),
          collectionMint: new anchor.web3.PublicKey(collection_mint.publicKey),
          carNftMint: new anchor.web3.PublicKey(car_nft_mint.publicKey),
          rentFeeMint: new anchor.web3.PublicKey(rent_fee_mint),
          rentalState: rental_state,
          rentVault: rent_vault_ata,
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
        .instruction();


    const rentalEndTime = new BN(1723440865);
    const trigger = { timestamp: rentalEndTime };

    const taskId = 2;
    const queueTaskArgs = {
      id: taskId,
      trigger: trigger,
      transaction: { compiledV0: compileTxFunction(tx_end_rental.data) },
    };

    console.log("Scheduling logic would run here...");

    const [taskKey] = PublicKey.findProgramAddressSync(
      [
        TASK_SEED,
        taskQueueKey.toBuffer(),
        new BN(taskId).toArrayLike(Buffer, "le", 2),
      ],
      tuktukProgram.programId
    );
    const [taskQueueAuthorityKey] = PublicKey.findProgramAddressSync(
      [
        TASK_QUEUE_AUTHORITY_SEED,
        taskQueueKey.toBuffer(),
        keypair.publicKey.toBuffer(),
      ],
      tuktukProgram.programId
    );

    try {
      const txSignature = await tuktukProgram.methods
        .queueTaskV0(queueTaskArgs)
        .accounts({
          task: taskKey,
          taskQueue: taskQueueKey,
          taskQueueAuthority: taskQueueAuthorityKey,
          queueAuthority: keypair.publicKey,
          payer: keypair.publicKey,
          systemProgram: SYSTEM_PROGRAM_ID,
        })
        .signers([keypair]) // Our wallet is both the payer and the queue authority
        .rpc();

      console.log(`\n✅ Task successfully scheduled!`);
      console.log(
        `Transaction: https://explorer.solana.com/tx/${txSignature}?cluster=devnet`
      );
      console.log(`It will be executable in about 60 seconds.`);
      console.log(
        `You can run it later using a crank client against the task key: ${taskKey.toBase58()}`
      );
    } catch (err) {
      console.error("Error scheduling task:", err);
    }
  }
});
