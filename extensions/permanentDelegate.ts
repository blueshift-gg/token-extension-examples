import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, sendAndConfirmTransaction, SystemProgram, Transaction } from "@solana/web3.js"

import {
    ExtensionType,
    TOKEN_2022_PROGRAM_ID,
    createAssociatedTokenAccountIdempotentInstruction,
    createInitializeMintInstruction,
    createInitializeTransferFeeConfigInstruction,
    getMintLen,
    getTransferFeeAmount,
    unpackAccount,
    getAssociatedTokenAddress,
    createMintToInstruction,
    createTransferCheckedInstruction,
    createWithdrawWithheldTokensFromAccountsInstruction,
    createTransferCheckedWithFeeInstruction,
    withdrawWithheldTokensFromAccounts,
    transferChecked,
    createInitializePermanentDelegateInstruction,
    createBurnInstruction,
    createBurnCheckedInstruction,
  } from "@solana/spl-token";

import wallet from "../wallet.json"

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

    // Size of Mint Account with extensions
    const mintLen = getMintLen([ExtensionType.PermanentDelegate]);
    // Minimum lamports required for Mint Account
    const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

    const createAccountInstruction = SystemProgram.createAccount({
        fromPubkey: keypair.publicKey,
        newAccountPubkey: mint.publicKey,
        space: mintLen,
        lamports,
        programId: TOKEN_2022_PROGRAM_ID,
    });

    const initializePermanentDelegate = createInitializePermanentDelegateInstruction(
        mint.publicKey,
        keypair.publicKey,
        TOKEN_2022_PROGRAM_ID,
    );

    const initializeMintInstruction = createInitializeMintInstruction(
        mint.publicKey,
        6,
        keypair.publicKey,
        null,
        TOKEN_2022_PROGRAM_ID,
    );

    const transaction = new Transaction().add(
        createAccountInstruction,
        initializePermanentDelegate,
        initializeMintInstruction,
    );

    const signature = await sendAndConfirmTransaction(connection, transaction, [keypair, mint]);

    console.log(`Mint created! Check out your TX here: https://explorer.solana.com/tx/${signature}?cluster=devnet`);

    return mint;
}

// Create 5 different ATAs - one with main keypair, 4 with random keypairs
async function createTokenAccounts(connection: Connection, keypair: Keypair, mint: Keypair) {
    const destination = Keypair.generate();

    const tokenAccount = await getAssociatedTokenAddress(
        mint.publicKey,
        destination.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
    );

    // Create ATA creation instructions for all accounts
    const createAtaInstruction = createAssociatedTokenAccountIdempotentInstruction(
        keypair.publicKey, // payer
        tokenAccount, // associated token account address
        destination.publicKey, // owner
        mint.publicKey, // mint
        TOKEN_2022_PROGRAM_ID
    );

    // Mint tokens to source account (first ATA)
    const mintToInstruction = createMintToInstruction(
        mint.publicKey,
        tokenAccount, // destination
        keypair.publicKey, // mint authority
        1_000e6,
        undefined,
        TOKEN_2022_PROGRAM_ID,
    );

    const transaction = new Transaction().add(
        createAtaInstruction,
        mintToInstruction,
    );

    const signature = await sendAndConfirmTransaction(connection, transaction, [keypair], {skipPreflight: true});

    console.log(`Token accounts created and tokens minted! Check out your TX here: https://explorer.solana.com/tx/${signature}?cluster=devnet`);

    return { tokenAccount };
}

async function transferTokensThroughDelegation(connection: Connection, keypair: Keypair, mint: Keypair, tokenAccount: PublicKey) {
    const newTokenAccount = await getAssociatedTokenAddress(
        mint.publicKey,
        keypair.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
    );

    // Create ATA creation instructions for all accounts
    const createAtaInstruction = createAssociatedTokenAccountIdempotentInstruction(
        keypair.publicKey, // payer
        newTokenAccount, // associated token account address
        keypair.publicKey, // owner
        mint.publicKey, // mint
        TOKEN_2022_PROGRAM_ID
    );
    
    const transferInstructions = createTransferCheckedInstruction(
        tokenAccount,
        mint.publicKey, 
        newTokenAccount, 
        keypair.publicKey, 
        BigInt(100e6),
        6,
        undefined,
        TOKEN_2022_PROGRAM_ID,
    );

    const transaction = new Transaction().add(
        createAtaInstruction,
        transferInstructions,
    );

    const signature = await sendAndConfirmTransaction(connection, transaction, [keypair], {skipPreflight: true});

    console.log(`Tokens transferred! Check out your TX here: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
}

async function burnTokensThroughDelegation(connection: Connection, keypair: Keypair, mint: Keypair, tokenAccount: PublicKey) {
    const burnInstructions = createBurnCheckedInstruction(
        tokenAccount,
        mint.publicKey,
        keypair.publicKey,
        BigInt(100e6),
        6,
        undefined,
        TOKEN_2022_PROGRAM_ID,
    );

    const transaction = new Transaction().add(burnInstructions);

    const signature = await sendAndConfirmTransaction(connection, transaction, [keypair], {skipPreflight: true});

    console.log(`Tokens burned! Check out your TX here: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
}

(async () => {
    try {
        // We're going to claim 2 devnet SOL tokens
        await airdropIfNeeded(connection, keypair);

        // Create a new mint with transfer fee extension
        const mint = await createMint(connection, keypair);

        // Create 5 different ATAs - one with main keypair, 4 with random keypairs
        const tokenAccounts = await createTokenAccounts(connection, keypair, mint);

        // Transfer tokens to all ATAs
        await transferTokensThroughDelegation(connection, keypair, mint, tokenAccounts.tokenAccount);

        // Burn tokens through delegation
        await burnTokensThroughDelegation(connection, keypair, mint, tokenAccounts.tokenAccount);
    } catch(e) {
        console.error(`Oops, something went wrong: ${e}`)
    }
})();
