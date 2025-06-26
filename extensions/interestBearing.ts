import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, sendAndConfirmTransaction, SystemProgram, Transaction } from "@solana/web3.js"

import {
    ExtensionType,
    TOKEN_2022_PROGRAM_ID,
    createInitializeMintInstruction,
    getMintLen,
    createInitializeInterestBearingMintInstruction,
    getAssociatedTokenAddress,
    createAssociatedTokenAccountIdempotentInstruction,
    createMintToInstruction,
    createSetAuthorityInstruction,
    AuthorityType,
    createUpdateRateInterestBearingMintInstruction,
    amountToUiAmount,
    getAccount,
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
    const mintLen = getMintLen([ExtensionType.InterestBearingConfig]);
    // Minimum lamports required for Mint Account
    const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

    const createAccountInstruction = SystemProgram.createAccount({
        fromPubkey: keypair.publicKey,
        newAccountPubkey: mint.publicKey,
        space: mintLen,
        lamports,
        programId: TOKEN_2022_PROGRAM_ID,
    });

    const initializeMintInterestBearing = createInitializeInterestBearingMintInstruction(
        mint.publicKey,
        keypair.publicKey,
        500,
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
        initializeMintInterestBearing,
        initializeMintInstruction,
    );

    const signature = await sendAndConfirmTransaction(connection, transaction, [keypair, mint], {commitment: "finalized"});

    console.log(`Mint created! Check out your TX here: https://explorer.solana.com/tx/${signature}?cluster=devnet`);

    return mint;
}

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

async function updateRates(connection: Connection, keypair: Keypair, mint: Keypair) {
    const newRateAuthority = Keypair.generate();

    const setAuthorityInstruction = await createSetAuthorityInstruction(
        mint.publicKey,
        keypair.publicKey,
        AuthorityType.InterestRate,
        newRateAuthority.publicKey,
        [],
        TOKEN_2022_PROGRAM_ID,
    );

    const updateRateInstruction = await createUpdateRateInterestBearingMintInstruction(
        mint.publicKey,
        newRateAuthority.publicKey,
        1000, // updated rate
        undefined,
        TOKEN_2022_PROGRAM_ID,
    );

    const transaction = new Transaction().add(
        setAuthorityInstruction,
        updateRateInstruction,
    );

    const signature = await sendAndConfirmTransaction(connection, transaction, [keypair, newRateAuthority], {skipPreflight: false});
    
    console.log(`Rates updated! Check out your TX here: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
}

async function checkInterest(connection: Connection, keypair: Keypair, mint: Keypair, tokenAccount: PublicKey) {
    const tokenInfo = await getAccount(
        connection,
        tokenAccount,
        undefined,
        TOKEN_2022_PROGRAM_ID,
    );

    console.log("Token Amount: ", tokenInfo.amount);
      
    const uiAmount = await amountToUiAmount(
        connection,
        keypair,
        mint.publicKey,
        tokenInfo.amount,
        TOKEN_2022_PROGRAM_ID,
    );
      
    console.log("UI Amount: ", uiAmount);
}

(async () => {
    try {
        // We're going to claim 2 devnet SOL tokens
        await airdropIfNeeded(connection, keypair);

        // Create a new mint with transfer fee extension
        const mint = await createMint(connection, keypair);

        // Create a token account
        const ata = await createTokenAccounts(connection, keypair, mint);

        // Update rates
        await updateRates(connection, keypair, mint);

        // Wait for 10 seconds
        await new Promise(resolve => setTimeout(resolve, 10_000));

        // Check interest
        await checkInterest(connection, keypair, mint, ata);
    } catch(e) {
        console.error(`Oops, something went wrong: ${e}`)
    }
})();
