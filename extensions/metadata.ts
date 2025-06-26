import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, sendAndConfirmTransaction, SystemProgram, Transaction } from "@solana/web3.js"

import {
    ExtensionType,
    TOKEN_2022_PROGRAM_ID,
    createInitializeMintInstruction,
    getMintLen,
    TYPE_SIZE,
    LENGTH_SIZE,
    createInitializeMetadataPointerInstruction,
  } from "@solana/spl-token";

import wallet from "../wallet.json"
import { createInitializeInstruction, createUpdateFieldInstruction, createRemoveKeyInstruction, pack, TokenMetadata } from "@solana/spl-token-metadata";

// We're going to import our keypair from the wallet file
const keypair = Keypair.fromSecretKey(new Uint8Array(wallet));

//Create a Solana devnet connection to devnet SOL tokens
const connection = new Connection("https://api.devnet.solana.com"); 

// Function to airdrop 2 SOL if balance is less than 2 SOL
async function airdropIfNeeded(connection: Connection, keypair: Keypair) {
    const balance = await connection.getBalance(keypair.publicKey);
    if (balance < 1 * LAMPORTS_PER_SOL) {
        const airdropTx = await connection.requestAirdrop(keypair.publicKey, 2 * LAMPORTS_PER_SOL);
        console.log(`You've been airdropped 2 SOL! Check out your TX here: https://explorer.solana.com/tx/${airdropTx}?cluster=devnet`);
    } else {
        console.log("Sufficient balance, no airdrop needed.");
    }
}

// Create a new mint
async function createMint(connection: Connection, keypair: Keypair) {
    const mint = Keypair.generate();

    const metadata: TokenMetadata = {
        mint: mint.publicKey,
        name: "Test Token",
        symbol: "TST",
        uri: "https://example.com/metadata.json",
        additionalMetadata: [["customField", "customValue"]],
    };

    // Size of Mint Account with extensions
    const mintLen = getMintLen([ExtensionType.MetadataPointer]);
    
    // Size of the Metadata Extension
    const metadataLen = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;

    // Minimum lamports required for Mint Account
    const lamports = await connection.getMinimumBalanceForRentExemption(mintLen + metadataLen);

    const createAccountInstruction = SystemProgram.createAccount({
        fromPubkey: keypair.publicKey,
        newAccountPubkey: mint.publicKey,
        space: mintLen,
        lamports,
        programId: TOKEN_2022_PROGRAM_ID,
    });

    const initializeMetadataPointer = createInitializeMetadataPointerInstruction(
        mint.publicKey,
        keypair.publicKey,
        mint.publicKey,
        TOKEN_2022_PROGRAM_ID,
    );

    const initializeMintInstruction = createInitializeMintInstruction(
        mint.publicKey,
        6,
        keypair.publicKey,
        null,
        TOKEN_2022_PROGRAM_ID,
    );

    const initializeMetadataInstruction = createInitializeInstruction(
        {
            programId: TOKEN_2022_PROGRAM_ID,
            mint: mint.publicKey,
            metadata: mint.publicKey,
            name: metadata.name,
            symbol: metadata.symbol,
            uri: metadata.uri,
            mintAuthority: keypair.publicKey,
            updateAuthority: keypair.publicKey,
        }
    );

    const updateMetadataFieldInstructions = createUpdateFieldInstruction({
        metadata: mint.publicKey,
        updateAuthority: keypair.publicKey,
        programId: TOKEN_2022_PROGRAM_ID,
        field: metadata.additionalMetadata[0][0],
        value: metadata.additionalMetadata[0][1],
      });

    const transaction = new Transaction().add(
        createAccountInstruction,
        initializeMetadataPointer,
        initializeMintInstruction,
        initializeMetadataInstruction,
        updateMetadataFieldInstructions,
    );

    const signature = await sendAndConfirmTransaction(connection, transaction, [keypair, mint], {commitment: "finalized"});

    console.log(`Mint created! Check out your TX here: https://explorer.solana.com/tx/${signature}?cluster=devnet`);

    return mint;
}

async function updateMetadata(connection: Connection, keypair: Keypair, mint: Keypair) {
    const newMetadata: TokenMetadata = {
        mint: mint.publicKey,
        name: "New Name",
        symbol: "TST2",
        uri: "https://example.com/metadata2.json",
        additionalMetadata: [
            ["customField2", "customValue2"],
        ],
    };

    // Size of Mint Account with extensions
    const mintLen = getMintLen([ExtensionType.MetadataPointer]);
    
    // Size of the Metadata Extension
    const metadataLen = TYPE_SIZE + LENGTH_SIZE + pack(newMetadata).length;

    // Minimum lamports required for Mint Account
    const lamports = await connection.getMinimumBalanceForRentExemption(mintLen + metadataLen);

    // Get the old balance of the keypair
    const oldBalance = await connection.getBalance(mint.publicKey)

    console.log(`Old balance: ${oldBalance}`);
    console.log(`Lamports: ${lamports}`);

    // Add lamports to the Mint if needed to cover the new metadata rent exemption
    if (oldBalance < lamports) {
        const transferInstruction = SystemProgram.transfer({
            fromPubkey: keypair.publicKey,
            toPubkey: mint.publicKey,
            lamports: lamports - oldBalance,
        });

        const transaction = new Transaction().add(transferInstruction);

        const signature = await sendAndConfirmTransaction(connection, transaction, [keypair], {commitment: "finalized"});

        console.log(`Lamports added to Mint! Check out your TX here: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
    }

    const updateMetadataNameInstructions = createUpdateFieldInstruction({
        metadata: mint.publicKey,
        updateAuthority: keypair.publicKey,
        programId: TOKEN_2022_PROGRAM_ID,
        field: "Name", // Field | string
        value: "New Name",
    });

    const updateMetadataSymbolInstructions = createUpdateFieldInstruction({
        metadata: mint.publicKey,
        updateAuthority: keypair.publicKey,
        programId: TOKEN_2022_PROGRAM_ID,
        field: "Symbol", // Field | string
        value: "TST2",
    });

    const updateMetadataUriInstructions = createUpdateFieldInstruction({
        metadata: mint.publicKey,
        updateAuthority: keypair.publicKey,
        programId: TOKEN_2022_PROGRAM_ID,
        field: "Uri", // Field | string
        value: "https://example.com/metadata2.json",
    });

    const updateMetadataAdditionalMetadataInstructions = createUpdateFieldInstruction({
        metadata: mint.publicKey,
        updateAuthority: keypair.publicKey,
        programId: TOKEN_2022_PROGRAM_ID,
        field: "customField2", // Field | string
        value: "customValue2",
    });

    const removeMetadataKeyInstructions = createRemoveKeyInstruction({
        metadata: mint.publicKey,
        updateAuthority: keypair.publicKey,
        programId: TOKEN_2022_PROGRAM_ID,
        key: "customField", // Field | string
        idempotent: true,
    });

    const transaction = new Transaction().add(
        updateMetadataNameInstructions,
        updateMetadataSymbolInstructions,
        updateMetadataUriInstructions,
        removeMetadataKeyInstructions,
    );

    const signature = await sendAndConfirmTransaction(connection, transaction, [keypair], {commitment: "finalized"});

    console.log(`Metadata updated! Check out your TX here: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
}   

(async () => {
    try {
        // We're going to claim 2 devnet SOL tokens
        await airdropIfNeeded(connection, keypair);

        // Create a new mint with transfer fee extension
        const mint = await createMint(connection, keypair);

        // Update the metadata
        await updateMetadata(connection, keypair, mint);
    } catch(e) {
        console.error(`Oops, something went wrong: ${e}`)
    }
})();
