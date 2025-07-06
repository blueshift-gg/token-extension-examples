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
    createInitializeNonTransferableMintInstruction,
    createInitializeGroupMemberPointerInstruction,
    TOKEN_GROUP_MEMBER_SIZE,
    createInitializeGroupPointerInstruction,
  } from "@solana/spl-token";

import wallet from "../wallet.json"
import { createInitializeInstruction, pack, TokenMetadata } from "@solana/spl-token-metadata";
import { createInitializeGroupInstruction, createInitializeMemberInstruction, TOKEN_GROUP_SIZE } from "@solana/spl-token-group";

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
async function createGroup(connection: Connection, keypair: Keypair) {
    const group = Keypair.generate();

    const metadata: TokenMetadata = {
        mint: group.publicKey,
        name: "Example Collection",
        symbol: "EXCOL",
        uri: "https://example.com/metadata.json",
        additionalMetadata: [],
    };

    // Size of Mint Account with extensions
    const mintLen = getMintLen([
        ExtensionType.MintCloseAuthority,
        ExtensionType.GroupPointer,
        ExtensionType.MetadataPointer
    ]);
    
    // Size of the Metadata Extension
    const metadataLen = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;

    // Minimum lamports required for Mint Account
    const lamports = await connection.getMinimumBalanceForRentExemption(mintLen + metadataLen + TYPE_SIZE + LENGTH_SIZE + TOKEN_GROUP_SIZE);

    const createAccountInstruction = SystemProgram.createAccount({
        fromPubkey: keypair.publicKey,
        newAccountPubkey: group.publicKey,
        space: mintLen,
        lamports,
        programId: TOKEN_2022_PROGRAM_ID,
    });

    const initializeMintCloseAuthority = createInitializeMintCloseAuthorityInstruction(
        group.publicKey,
        keypair.publicKey,
        TOKEN_2022_PROGRAM_ID,
    );

    const initializeGroupPointer = createInitializeGroupPointerInstruction(
        group.publicKey,
        keypair.publicKey,
        TOKEN_2022_PROGRAM_ID,
    );

    const initializeMetadataPointer = createInitializeMetadataPointerInstruction(
        group.publicKey,
        keypair.publicKey,
        group.publicKey,
        TOKEN_2022_PROGRAM_ID,
    );

    const initializeMintInstruction = createInitializeMintInstruction(
        group.publicKey,
        6,
        keypair.publicKey,
        null,
        TOKEN_2022_PROGRAM_ID,
    );

    const initializeMetadataInstruction = createInitializeInstruction(
        {
            programId: TOKEN_2022_PROGRAM_ID,
            mint: group.publicKey,
            metadata: group.publicKey,
            name: metadata.name,
            symbol: metadata.symbol,
            uri: metadata.uri,
            mintAuthority: keypair.publicKey,
            updateAuthority: keypair.publicKey,
        }
    );

    const initializeGroupInstruction = createInitializeGroupInstruction({
        programId: TOKEN_2022_PROGRAM_ID,
        group: group.publicKey,
        mint: group.publicKey,
        mintAuthority: keypair.publicKey,
        updateAuthority: keypair.publicKey,
        maxSize: BigInt(100),
    });

    const transaction = new Transaction().add(
        createAccountInstruction,
        initializeMintCloseAuthority,
        initializeGroupPointer,
        initializeMetadataPointer,
        initializeMintInstruction,
        initializeMetadataInstruction,
        initializeGroupInstruction,
    );

    const signature = await sendAndConfirmTransaction(connection, transaction, [keypair, group], {commitment: "finalized"});

    console.log(`Group created! Check out your TX here: https://explorer.solana.com/tx/${signature}?cluster=devnet`);

    return group;
}

// Create a new mint
async function createMint(connection: Connection, keypair: Keypair, group: Keypair) {
    const mint = Keypair.generate();

    const metadata: TokenMetadata = {
        mint: mint.publicKey,
        name: "Example NFT",
        symbol: "EXNFT",
        uri: "https://example.com/metadata.json",
        additionalMetadata: [],
    };

    // Size of Mint Account with extensions
    const mintLen = getMintLen([
        ExtensionType.MintCloseAuthority,
        ExtensionType.NonTransferable,
        ExtensionType.GroupMemberPointer,
        ExtensionType.MetadataPointer
    ]);
    
    // Size of the Metadata Extension
    const metadataLen = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;

    // Minimum lamports required for Mint Account
    const lamports = await connection.getMinimumBalanceForRentExemption(mintLen + metadataLen + TYPE_SIZE + LENGTH_SIZE + TOKEN_GROUP_MEMBER_SIZE);

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

    const initializeGroupMemberPointer = createInitializeGroupMemberPointerInstruction(
        mint.publicKey,
        keypair.publicKey,
        TOKEN_2022_PROGRAM_ID,
    );

    const initializeMintNonTransferable = createInitializeNonTransferableMintInstruction(
        mint.publicKey,
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

    const initializeMemberInstruction = createInitializeMemberInstruction({
        programId: TOKEN_2022_PROGRAM_ID,
        group: group.publicKey,
        member: mint.publicKey,
        memberMint: mint.publicKey,
        memberMintAuthority: keypair.publicKey,
        groupUpdateAuthority: keypair.publicKey,
    });

    const transaction = new Transaction().add(
        createAccountInstruction,
        initializeMintCloseAuthority,
        initializeMintNonTransferable,
        initializeGroupMemberPointer,
        initializeMetadataPointer,
        initializeMintInstruction,
        initializeMetadataInstruction,
        initializeMemberInstruction,
    );

    const signature = await sendAndConfirmTransaction(connection, transaction, [keypair, mint], {commitment: "finalized"});

    console.log(`Mint created! Check out your TX here: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
}

(async () => {
    try {
        // We're going to claim 2 devnet SOL tokens
        await airdropIfNeeded(connection, keypair);

        // Create a new mint with transfer fee extension
        const group = await createGroup(connection, keypair);

        // Create a new mint with transfer fee extension
        await createMint(connection, keypair, group);
    } catch(e) {
        console.error(`Oops, something went wrong: ${e}`)
    }
})();
