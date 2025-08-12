import { BN } from "@coral-xyz/anchor";
import { tuktukConfigKey } from "@helium/tuktuk-sdk";
import {
  createTaskQueue,
  getTaskQueueForName,
  taskQueueAuthorityKey
} from "@helium/tuktuk-sdk";
import { Keypair } from "@solana/web3.js";
import * as fs from "fs";

export const TUKTUK_CONFIG = tuktukConfigKey()[0];

export function loadKeypair(path) {
  const rawData = fs.readFileSync(path);
  const secretKey = Uint8Array.from(JSON.parse(rawData.toString()));
  return Keypair.fromSecretKey(secretKey);
}

export async function initializeTaskQueue(program, name) {
  let taskQueue = await getTaskQueueForName(program, name);
  if (!taskQueue) {
    console.log("Task queue not found, creating...");
    const { pubkeys: { taskQueue: taskQueuePubkey } } =
      await (await createTaskQueue(program, {
        name,
        minCrankReward: new BN(10000),
        capacity: 10,
        lookupTables: [],
        // 48 hours
        staleTaskAge: 60 * 60 * 48,
      })).rpcAndKeys();
    taskQueue = taskQueuePubkey;
  }

  const queueAuthority = taskQueueAuthorityKey(
    taskQueue,
    program.provider.wallet.publicKey
  )[0];
  const queueAuthorityAccount =
    await program.account.taskQueueAuthorityV0.fetchNullable(queueAuthority);

  if (!queueAuthorityAccount) {
    console.log("Queue authority not found, creating...");
    await program.methods
      .addQueueAuthorityV0()
      .accounts({
        payer: program.provider.wallet.publicKey,
        queueAuthority: program.provider.wallet.publicKey,
        taskQueue,
      })
      .rpc();
  }

  return taskQueue;
}

export async function monitorTask(connection, task) {
  let taskAccount;
  do {
    try {
      taskAccount = await connection.getAccountInfo(task);
      if (!taskAccount) {
        const signature = await connection.getSignaturesForAddress(task, {
          limit: 1,
        });
        console.log(
          `Task completed! Transaction signature: ${signature[0].signature}`
        );
        break;
      }
      console.log("Task is still pending...");
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (e) {
      console.log("Task completed!");
      break;
    }
  } while (true);
}
