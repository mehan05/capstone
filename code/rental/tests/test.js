// // convert_phantom_to_solana.js
// const fs = require("fs");
// const bs58 = require("bs58");
// const { Keypair } = require("@solana/web3.js");

// // 1️⃣ If you have a base58 private key from Phantom, paste here:
// const base58PrivateKey = ""; // e.g. "4fGg..."

// // 2️⃣ If you have a JSON file with your Phantom's 32-byte secret key:
// let secretKeyArray;
// try {
//   secretKeyArray = JSON.parse(fs.readFileSync("wallet.json", "utf8"));
// } catch {
//   // Convert from base58 if JSON not available
//   secretKeyArray = Array.from(bs58.decode(base58PrivateKey));
// }

// const keypair = Keypair.fromSecretKey(Uint8Array.from(secretKeyArray));

// // Save Solana CLI compatible format
// fs.writeFileSync("wallet.json", JSON.stringify(Array.from(keypair.secretKey)));

// console.log("✅ Saved Solana keypair to wallet.json");
// console.log("Public Key:", keypair.publicKey.toBase58());

