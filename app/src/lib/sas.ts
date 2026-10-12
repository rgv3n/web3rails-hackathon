/**
 * Solana Attestation Service issuer. Server only. Uses the anchor key as credential authority, authorized signer and payer.
 * On-chain data: the five SAS fields of `sas-fields.ts`, nonce = wallet address, expiry = certificate expiry. Nothing else.
 * Env: SOLANA_ANCHOR_SECRET_KEY, SOLANA_CLUSTER, SOLANA_RPC_URL (see solana-anchor.ts). Mainnet needs SAS_MAINNET=1 as well.
 */
import { address, createClient, createKeyPairSignerFromBytes, type Address, type KeyPairSigner } from "@solana/kit";
import { solanaDevnetRpc, solanaMainnetRpc } from "@solana/kit-plugin-rpc";
import { payer } from "@solana/kit-plugin-signer";
import {
  SOLANA_ATTESTATION_SERVICE_PROGRAM_ADDRESS,
  SchemaDataType,
  deriveEventAuthorityAddress,
  deserializeAttestationData,
  fetchMaybeAttestation,
  fetchMaybeCredential,
  fetchMaybeSchema,
  fetchSchema,
  findAttestationPda,
  findCredentialPda,
  findSchemaPda,
  getCloseAttestationInstruction,
  getCreateAttestationInstruction,
  getCreateCredentialInstruction,
  getCreateSchemaInstruction,
  serializeAttestationData,
} from "@solana/attestation";
import bs58 from "bs58";
import { anchorCluster, anchorRpcUrl } from "./solana-anchor";
import { SAS_FIELD_NAMES, type SasFields } from "./sas-fields";

export const SAS_CREDENTIAL_NAME = "WEB3RAILS";
export const SAS_SCHEMA_NAME = "WALLET-OWNERSHIP";
export const SAS_SCHEMA_VERSION = 1;
export const SAS_SCHEMA_DESCRIPTION = "Wallet ownership verified by Web3Rails with a qualified certificate (eIDAS). No personal data.";
export const SAS_PROGRAM_ID = SOLANA_ATTESTATION_SERVICE_PROGRAM_ADDRESS;

export function sasConfigured() {
  if (!process.env.SOLANA_ANCHOR_SECRET_KEY) return false;
  return anchorCluster() === "devnet" || process.env.SAS_MAINNET === "1";
}
export function explorerAddressUrl(addr: string, cluster = anchorCluster()) {
  return `https://explorer.solana.com/address/${addr}${cluster === "devnet" ? "?cluster=devnet" : ""}`;
}

async function issuerSigner(): Promise<KeyPairSigner> {
  const secret = process.env.SOLANA_ANCHOR_SECRET_KEY;
  if (!secret) throw new Error("SOLANA_ANCHOR_SECRET_KEY is not set");
  return createKeyPairSignerFromBytes(bs58.decode(secret));
}
async function sasClient(signer: KeyPairSigner) {
  const base = createClient().use(payer(signer));
  const rpcUrl = anchorRpcUrl();
  return anchorCluster() === "devnet" ? base.use(solanaDevnetRpc({ rpcUrl })) : base.use(solanaMainnetRpc({ rpcUrl }));
}
type SasClient = Awaited<ReturnType<typeof sasClient>>;

/** Creates the credential and the schema once; later calls only read them. */
async function ensureCredentialAndSchema(c: SasClient, signer: KeyPairSigner) {
  const [credentialPda] = await findCredentialPda({ authority: signer.address, name: SAS_CREDENTIAL_NAME });
  const cred = await fetchMaybeCredential(c.rpc, credentialPda);
  if (!cred.exists) {
    await c.sendTransaction(getCreateCredentialInstruction({ payer: signer, credential: credentialPda, authority: signer, name: SAS_CREDENTIAL_NAME, signers: [signer.address] }));
  }
  const [schemaPda] = await findSchemaPda({ credential: credentialPda, name: SAS_SCHEMA_NAME, version: SAS_SCHEMA_VERSION });
  const sch = await fetchMaybeSchema(c.rpc, schemaPda);
  if (!sch.exists) {
    await c.sendTransaction(
      getCreateSchemaInstruction({
        payer: signer,
        authority: signer,
        credential: credentialPda,
        schema: schemaPda,
        name: SAS_SCHEMA_NAME,
        description: SAS_SCHEMA_DESCRIPTION,
        layout: SAS_FIELD_NAMES.map(() => SchemaDataType.String),
        fieldNames: [...SAS_FIELD_NAMES],
      }),
    );
  }
  return { credentialPda, schemaPda };
}

export interface PublishedSas {
  attestationPda: string;
  credentialPda: string;
  schemaPda: string;
  signature: string;
  cluster: "devnet" | "mainnet-beta";
  issuer: string;
}

/** Writes the attestation account for the wallet. Fails if one already exists on-chain for this wallet (close it first). */
export async function publishSasAttestation(fields: SasFields, expiryUnix: number): Promise<PublishedSas> {
  if (!sasConfigured()) throw new Error("SAS is not enabled on this server");
  if (!Number.isInteger(expiryUnix) || expiryUnix <= Math.floor(Date.now() / 1000)) throw new Error("expiry must be in the future");
  const signer = await issuerSigner();
  const c = await sasClient(signer);
  const { credentialPda, schemaPda } = await ensureCredentialAndSchema(c, signer);
  const nonce = address(fields.wallet);
  const [attestationPda] = await findAttestationPda({ credential: credentialPda, schema: schemaPda, nonce });
  const existing = await fetchMaybeAttestation(c.rpc, attestationPda);
  if (existing.exists) throw new Error(`an attestation for this wallet already exists on-chain (${attestationPda}); close it first`);
  const schema = await fetchSchema(c.rpc, schemaPda);
  const data = serializeAttestationData(schema.data, { ...fields });
  const res = await c.sendTransaction(
    getCreateAttestationInstruction({ payer: signer, authority: signer, credential: credentialPda, schema: schemaPda, attestation: attestationPda, nonce, data, expiry: expiryUnix }),
  );
  return { attestationPda, credentialPda, schemaPda, signature: res.context.signature, cluster: anchorCluster(), issuer: signer.address };
}

/** Closes (revokes) the attestation account. The rent returns to the payer; the history stays on-chain. */
export async function closeSasAttestation(attestationPda: string): Promise<{ signature: string }> {
  if (!sasConfigured()) throw new Error("SAS is not enabled on this server");
  const signer = await issuerSigner();
  const c = await sasClient(signer);
  const [credentialPda] = await findCredentialPda({ authority: signer.address, name: SAS_CREDENTIAL_NAME });
  const res = await c.sendTransaction(
    getCloseAttestationInstruction({
      payer: signer,
      authority: signer,
      credential: credentialPda,
      attestation: address(attestationPda),
      eventAuthority: await deriveEventAuthorityAddress(),
      attestationProgram: SAS_PROGRAM_ID,
    }),
  );
  return { signature: res.context.signature };
}

export interface OnChainSas { fields: SasFields; expiry: number; signer: Address; credential: Address; schema: Address }

/** Reads an attestation back from the chain, as any verifier would. */
export async function readSasAttestation(attestationPda: string): Promise<OnChainSas | null> {
  const signer = await issuerSigner();
  const c = await sasClient(signer);
  const acc = await fetchMaybeAttestation(c.rpc, address(attestationPda));
  if (!acc.exists) return null;
  const schema = await fetchSchema(c.rpc, acc.data.schema);
  const fields = deserializeAttestationData<SasFields>(schema.data, acc.data.data);
  return { fields, expiry: Number(acc.data.expiry), signer: acc.data.signer, credential: acc.data.credential, schema: acc.data.schema };
}
