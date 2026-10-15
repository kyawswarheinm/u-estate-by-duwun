import "server-only";
import { createPublicClient, createWalletClient, hexToString, http, stringToHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";

// A1 (D-33): publish a fingerprint of the transparency ledger on Avalanche Fuji (testnet).
// Only a short text with a SHA-256 hash goes on-chain: no tokens, no money, no personal data,
// no smart contract and no user wallets. The chain is hard-coded to Fuji, so this can never touch mainnet.
export const AVALANCHE_NETWORK = "Avalanche Fuji C-Chain (testnet)";
export const AVALANCHE_CHAIN_ID = avalancheFuji.id; // 43113

const rpc = () => process.env.AVALANCHE_RPC_URL || avalancheFuji.rpcUrls.default.http[0];
const publicClient = () => createPublicClient({ chain: avalancheFuji, transport: http(rpc(), { timeout: 15_000 }) });

export function avalancheConfigured() {
  return Boolean(process.env.AVALANCHE_PRIVATE_KEY);
}

export function explorerTxUrl(txHash: string) {
  return `${avalancheFuji.blockExplorers.default.url}/tx/${txHash}`;
}

function account() {
  const raw = process.env.AVALANCHE_PRIVATE_KEY!.trim();
  return privateKeyToAccount((raw.startsWith("0x") ? raw : `0x${raw}`) as Hex);
}

export function anchorWalletAddress() {
  return avalancheConfigured() ? account().address : null;
}

/** Sends a 0-AVAX transaction to our own address with the message as data, and waits for it to be mined. */
export async function publishAnchor(message: string) {
  const acct = account();
  const wallet = createWalletClient({ account: acct, chain: avalancheFuji, transport: http(rpc(), { timeout: 15_000 }) });
  const txHash = await wallet.sendTransaction({ to: acct.address, value: BigInt(0), data: stringToHex(message) });
  const receipt = await publicClient().waitForTransactionReceipt({ hash: txHash, timeout: 30_000 });
  if (receipt.status !== "success") throw new Error("Anchor transaction reverted");
  return { txHash, blockNumber: Number(receipt.blockNumber), from: acct.address };
}

/** Reads the message back from the chain, for independent verification. */
export async function readAnchor(txHash: string) {
  const tx = await publicClient().getTransaction({ hash: txHash as Hex });
  return { message: hexToString(tx.input), from: tx.from, blockNumber: tx.blockNumber === null ? null : Number(tx.blockNumber) };
}
