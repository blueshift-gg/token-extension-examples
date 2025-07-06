import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, sendAndConfirmTransaction, SystemProgram, Transaction } from "@solana/web3.js"

import {
    ExtensionType,
    TOKEN_2022_PROGRAM_ID,
    createAssociatedTokenAccountIdempotentInstruction,
    createInitializeMintInstruction,
    getAssociatedTokenAddress,
    createMintToInstruction,
    createTransferCheckedInstruction,
    createEnableRequiredMemoTransfersInstruction,
    createDisableRequiredMemoTransfersInstruction,
    getAccountLen,
    createInitializeAccountInstruction,
    MINT_SIZE,
} from "@solana/spl-token";

import { createMemoInstruction } from "@solana/spl-memo";

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

    // Minimum lamports required for Mint Account
    const lamports = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);

    const createAccountInstruction = SystemProgram.createAccount({
        fromPubkey: keypair.publicKey,
        newAccountPubkey: mint.publicKey,
        space: MINT_SIZE,
        lamports,
        programId: TOKEN_2022_PROGRAM_ID,
    });

    const initializeMintInstruction = createInitializeMintInstruction(
        mint.publicKey,
        6,
        keypair.publicKey,
        keypair.publicKey,
        TOKEN_2022_PROGRAM_ID,
    );

    const transaction = new Transaction().add(
        createAccountInstruction,
        initializeMintInstruction,
    );

    const signature = await sendAndConfirmTransaction(connection, transaction, [keypair, mint], {commitment: "finalized"});

    console.log(`Mint created! Check out your TX here: https://explorer.solana.com/tx/${signature}?cluster=devnet`);

    return mint;
}

// Create 5 different ATAs - one with main keypair, 4 with random keypairs
async function createTokenAccounts(connection: Connection, keypair: Keypair, mint: Keypair) {    
    const ata = await getAssociatedTokenAddress(
        mint.publicKey,
        keypair.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
    );

    // Create ATA creation instructions for all accounts
    const createAtaInstructions = createAssociatedTokenAccountIdempotentInstruction(
        keypair.publicKey, // payer
        ata, // associated token account address
        keypair.publicKey, // owner
        mint.publicKey, // mint
        TOKEN_2022_PROGRAM_ID
    )

    // Mint tokens to source account (first ATA)
    const mintToInstruction = createMintToInstruction(
        mint.publicKey,
        ata, // destination
        keypair.publicKey, // mint authority
        1_000e6,
        undefined,
        TOKEN_2022_PROGRAM_ID,
    );

    const transaction = new Transaction().add(
        createAtaInstructions,
        mintToInstruction,
    );

    const signature = await sendAndConfirmTransaction(connection, transaction, [keypair], {skipPreflight: false});

    console.log(`Token accounts created and tokens minted! Check out your TX here: https://explorer.solana.com/tx/${signature}?cluster=devnet`);

    return ata;
}

async function transferTokensWithMemo(connection: Connection, keypair: Keypair, mint: Keypair, tokenAccount: PublicKey) {
    const destinationKeypair = Keypair.generate();
    const destinationTokenAccount = Keypair.generate();

    // Size of Token Account with extensions
    const accountLen = getAccountLen([ExtensionType.MemoTransfer]);

    // Minimum lamports required for Token Account
    const lamports = await connection.getMinimumBalanceForRentExemption(accountLen);

    const createAccountInstruction = SystemProgram.createAccount({
        fromPubkey: keypair.publicKey,
        newAccountPubkey: destinationTokenAccount.publicKey,
        space: accountLen,
        lamports,
        programId: TOKEN_2022_PROGRAM_ID,
    });

    const initializeAccountInstruction = createInitializeAccountInstruction(
        destinationTokenAccount.publicKey,
        mint.publicKey,
        destinationKeypair.publicKey,
        TOKEN_2022_PROGRAM_ID,
    );

    const enableMemoTransferInstruction = createEnableRequiredMemoTransfersInstruction(
        destinationTokenAccount.publicKey,
        destinationKeypair.publicKey,
        undefined,
        TOKEN_2022_PROGRAM_ID,
    );

    const transaction = new Transaction().add(
        createAccountInstruction,
        initializeAccountInstruction,
        enableMemoTransferInstruction,
    );

    const signature = await sendAndConfirmTransaction(connection, transaction, [keypair, destinationTokenAccount, destinationKeypair], {skipPreflight: false});

    console.log(`Destination token account created! Check out your TX here: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
    
    const memoInstruction = createMemoInstruction(
        "Hello, world!",
        [keypair.publicKey],
    );

    const transferInstruction = createTransferCheckedInstruction(
        tokenAccount,
        mint.publicKey,
        destinationTokenAccount.publicKey,
        keypair.publicKey,
        BigInt(100e6),
        6,
        undefined,
        TOKEN_2022_PROGRAM_ID,
    );

    const transferTransaction = new Transaction().add(
        memoInstruction,
        transferInstruction,
    );

    const transferSignature = await sendAndConfirmTransaction(connection, transferTransaction, [keypair], {skipPreflight: false});

    console.log(`Tokens transferred with memo! Check out your TX here: https://explorer.solana.com/tx/${transferSignature}?cluster=devnet`);
    
    return {destinationTokenAccount: destinationTokenAccount.publicKey, destinationKeypair: destinationKeypair};
}

async function updateMemoRequirementAndTransferTokens(connection: Connection, keypair: Keypair, mint: Keypair, tokenAccount: PublicKey, destinationTokenAccount: PublicKey, destinationKeypair: Keypair) {
    const disableRequiredMemoTransfersInstruction = createDisableRequiredMemoTransfersInstruction(
        destinationTokenAccount,
        destinationKeypair.publicKey,
        undefined,
        TOKEN_2022_PROGRAM_ID,
    );

    const enableRequiredMemoTransfersInstruction = createEnableRequiredMemoTransfersInstruction(
        destinationTokenAccount,
        destinationKeypair.publicKey,
        undefined,
        TOKEN_2022_PROGRAM_ID,
    );

    const transferInstruction = createTransferCheckedInstruction(
        tokenAccount,
        mint.publicKey,
        destinationTokenAccount,
        keypair.publicKey,
        BigInt(100e6),
        6,
        undefined,
        TOKEN_2022_PROGRAM_ID,
    );

    const transaction = new Transaction().add(
        disableRequiredMemoTransfersInstruction,
        transferInstruction,
    );

    const signature = await sendAndConfirmTransaction(connection, transaction, [keypair, destinationKeypair], {skipPreflight: false});

    console.log(`Tokens transferred and account state changed! Check out your TX here: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
}

(async () => {
    try {
        // We're going to claim 2 devnet SOL tokens
        await airdropIfNeeded(connection, keypair);

        // Create a new mint with transfer fee extension
        const mint = await createMint(connection, keypair);

        // Create a token account
        const tokenAccount = await createTokenAccounts(connection, keypair, mint);

        // Transfer tokens with memo
        const {destinationTokenAccount, destinationKeypair} = await transferTokensWithMemo(connection, keypair, mint, tokenAccount);

        // Update memo requirement and transfer tokens
        await updateMemoRequirementAndTransferTokens(connection, keypair, mint, tokenAccount, destinationTokenAccount, destinationKeypair);
    } catch(e) {
        console.error(`Oops, something went wrong: ${e}`)
    }
})();
