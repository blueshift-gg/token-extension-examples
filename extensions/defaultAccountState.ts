import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, sendAndConfirmTransaction, SystemProgram, Transaction } from "@solana/web3.js"

import {
    ExtensionType,
    TOKEN_2022_PROGRAM_ID,
    createAssociatedTokenAccountIdempotentInstruction,
    createInitializeMintInstruction,
    getMintLen,
    getAssociatedTokenAddress,
    createMintToInstruction,
    createCloseAccountInstruction,
    createInitializeMintCloseAuthorityInstruction,
    createBurnInstruction,
    createInitializeDefaultAccountStateInstruction,
    AccountState,
    createThawAccountInstruction,
    createUpdateDefaultAccountStateInstruction,
    createTransferCheckedInstruction,
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
    const mintLen = getMintLen([ExtensionType.DefaultAccountState]);
    // Minimum lamports required for Mint Account
    const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

    const createAccountInstruction = SystemProgram.createAccount({
        fromPubkey: keypair.publicKey,
        newAccountPubkey: mint.publicKey,
        space: mintLen,
        lamports,
        programId: TOKEN_2022_PROGRAM_ID,
    });

    const initializeDefaultAccountState = createInitializeDefaultAccountStateInstruction(
        mint.publicKey,
        AccountState.Frozen,
        TOKEN_2022_PROGRAM_ID,
    );

    const initializeMintInstruction = createInitializeMintInstruction(
        mint.publicKey,
        6,
        keypair.publicKey,
        keypair.publicKey,
        TOKEN_2022_PROGRAM_ID,
    );

    const transaction = new Transaction().add(
        createAccountInstruction,
        initializeDefaultAccountState,
        initializeMintInstruction,
    );

    const signature = await sendAndConfirmTransaction(connection, transaction, [keypair, mint], {skipPreflight: true});

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

    const thawAtaInstruction = createThawAccountInstruction(
        ata,
        mint.publicKey,
        keypair.publicKey,
        undefined,
        TOKEN_2022_PROGRAM_ID,
    );

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
        thawAtaInstruction,
        mintToInstruction,
    );

    const signature = await sendAndConfirmTransaction(connection, transaction, [keypair], {skipPreflight: true});

    console.log(`Token accounts created and tokens minted! Check out your TX here: https://explorer.solana.com/tx/${signature}?cluster=devnet`);

    return ata;
}

async function transferAndChangeAccountState(connection: Connection, keypair: Keypair, mint: Keypair, tokenAccount: PublicKey) {
    const updateDefaultAccountStateInstruction = createUpdateDefaultAccountStateInstruction(
        mint.publicKey,
        AccountState.Initialized,
        keypair.publicKey,
        undefined,
        TOKEN_2022_PROGRAM_ID,
    );

    const destinationKeypair = Keypair.generate();

    const destinationAta = await getAssociatedTokenAddress(
        mint.publicKey,
        destinationKeypair.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
    );

    const createAtaInstructions = createAssociatedTokenAccountIdempotentInstruction(
        keypair.publicKey, 
        destinationAta, 
        destinationKeypair.publicKey, 
        mint.publicKey, 
        TOKEN_2022_PROGRAM_ID
    )

    const transferInstruction = createTransferCheckedInstruction(
        tokenAccount,
        mint.publicKey,
        destinationAta,
        keypair.publicKey,
        BigInt(100e6),
        6,
        undefined,
        TOKEN_2022_PROGRAM_ID,
    );

    const transaction = new Transaction().add(
        updateDefaultAccountStateInstruction,
        createAtaInstructions,
        transferInstruction,
    );

    const signature = await sendAndConfirmTransaction(connection, transaction, [keypair], {skipPreflight: true});

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

        // Transfer and change account state
        await transferAndChangeAccountState(connection, keypair, mint, tokenAccount);
    } catch(e) {
        console.error(`Oops, something went wrong: ${e}`)
    }
})();
