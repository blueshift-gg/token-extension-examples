import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, sendAndConfirmTransaction, SystemProgram, Transaction } from "@solana/web3.js"

import {
    ExtensionType,
    TOKEN_2022_PROGRAM_ID,
    createInitializeMintInstruction,
    getMintLen,
    TYPE_SIZE,
    LENGTH_SIZE,
    createInitializeMetadataPointerInstruction,
    createInitializeMintCloseAuthorityInstruction,
    createInitializePermanentDelegateInstruction,
    createInitializeTransferFeeConfigInstruction,
    createInitializeTransferHookInstruction,
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
        name: "PayPal USD",
        symbol: "PYUSD",
        uri: "https://token-metadata.paxos.com/pyusd_metadata/prod/solana/pyusd_metadata.json",
        additionalMetadata: [],
    };

    // Size of Mint Account with extensions
    const mintLen = getMintLen([
        ExtensionType.MintCloseAuthority,
        ExtensionType.PermanentDelegate,
        ExtensionType.TransferFeeConfig,
        ExtensionType.TransferHook,
        ExtensionType.MetadataPointer
    ]);
    
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

    const initializeMintCloseAuthority = createInitializeMintCloseAuthorityInstruction(
        mint.publicKey,
        keypair.publicKey,
        TOKEN_2022_PROGRAM_ID,
    );

    const initializePermanentDelegate = createInitializePermanentDelegateInstruction(
        mint.publicKey,
        keypair.publicKey,
        TOKEN_2022_PROGRAM_ID,
    );

    const initializeTransferFeeConfig = createInitializeTransferFeeConfigInstruction(
        mint.publicKey,
        keypair.publicKey,
        keypair.publicKey,
        500,
        BigInt(1e6),
        TOKEN_2022_PROGRAM_ID,
    );

    const initializeTransferHook = createInitializeTransferHookInstruction(
        mint.publicKey,
        keypair.publicKey,
        Keypair.generate().publicKey, 
        TOKEN_2022_PROGRAM_ID,
    );

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

    const transaction = new Transaction().add(
        createAccountInstruction,
        initializeMintCloseAuthority,
        initializePermanentDelegate,
        initializeTransferFeeConfig,
        initializeTransferHook,
        initializeMetadataPointer,
        initializeMintInstruction,
        initializeMetadataInstruction,
    );

    const signature = await sendAndConfirmTransaction(connection, transaction, [keypair, mint], {commitment: "finalized"});

    console.log(`Mint created! Check out your TX here: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
}

(async () => {
    try {
        // We're going to claim 2 devnet SOL tokens
        await airdropIfNeeded(connection, keypair);

        // Create a new mint with transfer fee extension
        await createMint(connection, keypair);
    } catch(e) {
        console.error(`Oops, something went wrong: ${e}`)
    }
})();
