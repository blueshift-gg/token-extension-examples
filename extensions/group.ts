import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, sendAndConfirmTransaction, SystemProgram, Transaction } from "@solana/web3.js"

import {
    ExtensionType,
    TOKEN_2022_PROGRAM_ID,
    createInitializeMintInstruction,
    getMintLen,
    createInitializeGroupPointerInstruction,
    createInitializeGroupMemberPointerInstruction,
    TYPE_SIZE,
    LENGTH_SIZE,
} from "@solana/spl-token";

import wallet from "../wallet.json"
import { createInitializeGroupInstruction, TOKEN_GROUP_SIZE, createUpdateGroupAuthorityInstruction, createInitializeMemberInstruction, TOKEN_GROUP_MEMBER_SIZE, createUpdateGroupMaxSizeInstruction } from "@solana/spl-token-group";

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
    const mintLen = getMintLen([ExtensionType.GroupPointer]);

    // Minimum lamports required for Mint Account
    const lamports = await connection.getMinimumBalanceForRentExemption(mintLen + TYPE_SIZE + LENGTH_SIZE + TOKEN_GROUP_SIZE);

    const createAccountInstruction = SystemProgram.createAccount({
        fromPubkey: keypair.publicKey,
        newAccountPubkey: mint.publicKey,
        space: mintLen,
        lamports,
        programId: TOKEN_2022_PROGRAM_ID,
    });

    const initializeGroupPointer = createInitializeGroupPointerInstruction(
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

    const initializeGroupInstruction = createInitializeGroupInstruction(
        {
            programId: TOKEN_2022_PROGRAM_ID,
            group: mint.publicKey,
            mint: mint.publicKey,
            mintAuthority: keypair.publicKey,
            updateAuthority: keypair.publicKey,
            maxSize: BigInt(100),
        }
    );

    const transaction = new Transaction().add(
        createAccountInstruction,
        initializeGroupPointer,
        initializeMintInstruction,
        initializeGroupInstruction,
    );

    const signature = await sendAndConfirmTransaction(connection, transaction, [keypair, mint], {commitment: "finalized"});

    console.log(`Mint created! Check out your TX here: https://explorer.solana.com/tx/${signature}?cluster=devnet`);

    return mint;
}

async function createMember(connection: Connection, keypair: Keypair, mint: Keypair) {
    const member = Keypair.generate();

    // Size of Member Account with extensions
    const memberLen = getMintLen([ExtensionType.GroupMemberPointer]);

    // Minimum lamports required for Member Account
    const lamports = await connection.getMinimumBalanceForRentExemption(memberLen + TYPE_SIZE + LENGTH_SIZE + TOKEN_GROUP_MEMBER_SIZE);

    const createAccountInstruction = SystemProgram.createAccount({
        fromPubkey: keypair.publicKey,
        newAccountPubkey: member.publicKey,
        space: memberLen,
        lamports,
        programId: TOKEN_2022_PROGRAM_ID,
    });

    const initializeGroupMemberPointer = createInitializeGroupMemberPointerInstruction(
        member.publicKey,
        keypair.publicKey,
        member.publicKey,
        TOKEN_2022_PROGRAM_ID,
    );

    const initializeMintInstruction = createInitializeMintInstruction(
        member.publicKey,
        6,
        keypair.publicKey,
        null,
        TOKEN_2022_PROGRAM_ID,
    );

    const initializeGroupMemberInstruction = createInitializeMemberInstruction(
        {
            programId: TOKEN_2022_PROGRAM_ID,
            group: mint.publicKey,
            member: member.publicKey,
            memberMint: member.publicKey,
            memberMintAuthority: keypair.publicKey,
            groupUpdateAuthority: keypair.publicKey,
        }
    );

    const transaction = new Transaction().add(
        createAccountInstruction,
        initializeGroupMemberPointer,
        initializeMintInstruction,
        initializeGroupMemberInstruction,
    );

    const signature = await sendAndConfirmTransaction(connection, transaction, [keypair, member], {commitment: "finalized"});

    console.log(`Member created! Check out your TX here: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
}

async function updateGroup(connection: Connection, keypair: Keypair, mint: Keypair) {
    const updateGroupAuthorityInstructions = createUpdateGroupAuthorityInstruction(
        {
            programId: TOKEN_2022_PROGRAM_ID,
            group: mint.publicKey,
            currentAuthority: keypair.publicKey,
            newAuthority: null,
        }
    );

    const updateGroupMaxSizeInstructions = createUpdateGroupMaxSizeInstruction(
        {
            programId: TOKEN_2022_PROGRAM_ID,
            group: mint.publicKey,
            updateAuthority: keypair.publicKey,
            maxSize: BigInt(100),
        }
    );

    const transaction = new Transaction().add(updateGroupAuthorityInstructions, updateGroupMaxSizeInstructions);

    const signature = await sendAndConfirmTransaction(connection, transaction, [keypair], {commitment: "finalized"});

    console.log(`Group updated! Check out your TX here: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
} 

(async () => {
    try {
        // We're going to claim 2 devnet SOL tokens
        await airdropIfNeeded(connection, keypair);

        // Create a new mint with transfer fee extension
        const mint = await createMint(connection, keypair);

        // Create a new member
        await createMember(connection, keypair, mint);

        // Update the group
        await updateGroup(connection, keypair, mint);
    } catch(e) {
        console.error(`Oops, something went wrong: ${e}`)
    }
})();
