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
    createSetTransferFeeInstruction,
    transferChecked,
  } from "@solana/spl-token";

import wallet from "./../wallet.json"

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
    const mintLen = getMintLen([ExtensionType.TransferFeeConfig]);
    // Minimum lamports required for Mint Account
    const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

    const createAccountInstruction = SystemProgram.createAccount({
        fromPubkey: keypair.publicKey,
        newAccountPubkey: mint.publicKey,
        space: mintLen,
        lamports,
        programId: TOKEN_2022_PROGRAM_ID,
    });

    const initializeTransferFeeConfig = createInitializeTransferFeeConfigInstruction(
        mint.publicKey,
        keypair.publicKey,
        keypair.publicKey,
        500,
        BigInt(1e6),
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
        initializeTransferFeeConfig,
        initializeMintInstruction,
    );

    const signature = await sendAndConfirmTransaction(connection, transaction, [keypair, mint]);

    console.log(`Mint created! Check out your TX here: https://explorer.solana.com/tx/${signature}?cluster=devnet`);

    return mint;
}

// Create 5 different ATAs - one with main keypair, 4 with random keypairs
async function createTokenAccounts(connection: Connection, keypair: Keypair, mint: Keypair) {
    // Generate 4 random keypairs
    const randomKeypairs = Array.from({ length: 4 }, () => Keypair.generate());
    
    // Create ATAs for all keypairs (main + 4 random)
    const allKeypairs = [keypair, ...randomKeypairs];
    
    // Get the associated token addresses for all keypairs
    const tokenAccounts = await Promise.all(
        allKeypairs.map(async (kp) => {
            const ata = await getAssociatedTokenAddress(
                mint.publicKey,
                kp.publicKey,
                false,
                TOKEN_2022_PROGRAM_ID
            );
            return { keypair: kp, tokenAccount: ata };
        })
    );

    // Create ATA creation instructions for all accounts
    const createAtaInstructions = tokenAccounts.map(({ keypair: kp, tokenAccount }) =>
        createAssociatedTokenAccountIdempotentInstruction(
            keypair.publicKey, // payer
            tokenAccount, // associated token account address
            kp.publicKey, // owner
            mint.publicKey, // mint
            TOKEN_2022_PROGRAM_ID
        )
    );

    // Mint tokens to source account (first ATA)
    const mintToInstruction = createMintToInstruction(
        mint.publicKey,
        tokenAccounts[0].tokenAccount, // destination
        keypair.publicKey, // mint authority
        1_000e6,
        undefined,
        TOKEN_2022_PROGRAM_ID,
    );

    const transaction = new Transaction().add(
        ...createAtaInstructions,
        mintToInstruction,
    );

    const signature = await sendAndConfirmTransaction(connection, transaction, [keypair], {skipPreflight: true});

    console.log(`Token accounts created and tokens minted! Check out your TX here: https://explorer.solana.com/tx/${signature}?cluster=devnet`);

    return tokenAccounts;
}

async function transferTokens(connection: Connection, keypair: Keypair, mint: Keypair, tokenAccounts: any[]) {
    // Create transfer instructions from first account to all other accounts
    const sourceAccount = tokenAccounts[0];
    const destinationAccounts = tokenAccounts.slice(1);
    
    const transferInstructions = destinationAccounts.map(({ tokenAccount: destination }) =>
        createTransferCheckedWithFeeInstruction(
            sourceAccount.tokenAccount,
            mint.publicKey, 
            destination, 
            keypair.publicKey, 
            BigInt(100e6),
            6,
            BigInt(1e6),
            undefined,
            TOKEN_2022_PROGRAM_ID,
        )
    );

    const transaction = new Transaction().add(
        ...transferInstructions,
    );

    const signature = await sendAndConfirmTransaction(connection, transaction, [keypair], {skipPreflight: true});

    console.log(`Tokens transferred! Check out your TX here: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
}

async function harvestWithheldTokens(connection: Connection, keypair: Keypair, mint: Keypair, sourceTokenAccount: PublicKey) {

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Retrieve all Token Accounts for the Mint Account
    const allAccounts = await connection.getProgramAccounts(TOKEN_2022_PROGRAM_ID, {
        commitment: "confirmed",
        filters: [
            {
                memcmp: {
                    offset: 0,
                    bytes: mint.publicKey.toString(), // Mint Account address
                },
            },
        ],
    });

    // List of Token Accounts to withdraw fees from
    const accountsToWithdrawFrom: PublicKey[] = [];

    for (const accountInfo of allAccounts) {
        const account = unpackAccount(
            accountInfo.pubkey,
            accountInfo.account,
            TOKEN_2022_PROGRAM_ID,
        );

        // Extract transfer fee data from each account
        const transferFeeAmount = getTransferFeeAmount(account);

        // Check if fees are available to be withdrawn
        if (transferFeeAmount !== null && transferFeeAmount.withheldAmount > 0) {
            accountsToWithdrawFrom.push(accountInfo.pubkey);
        }
    }
    
    const harvestInstructions = createWithdrawWithheldTokensFromAccountsInstruction(
        mint.publicKey,
        sourceTokenAccount,
        keypair.publicKey,
        [],
        accountsToWithdrawFrom,
        TOKEN_2022_PROGRAM_ID,
    );

    const transaction = new Transaction().add(harvestInstructions);

    const signature = await sendAndConfirmTransaction(connection, transaction, [keypair], {skipPreflight: false});

    console.log(`Withheld tokens harvested! Check out your TX here: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
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
        await transferTokens(connection, keypair, mint, tokenAccounts);

        // Harvest withheld tokens from all ATAs
        await harvestWithheldTokens(connection, keypair, mint, tokenAccounts[0].tokenAccount);
    } catch(e) {
        console.error(`Oops, something went wrong: ${e}`)
    }
})();
