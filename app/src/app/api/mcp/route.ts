/**
 * Web3Rails MCP server (read-only, v1). Organizations connect their AI assistant with an API key as bearer token:
 *   { "web3rails": { "url": "https://app.web3rails.io/api/mcp", "headers": { "Authorization": "Bearer w3r_live_…" } } }
 * Every tool call is scoped to the key's organization and audited as actor 'api'.
 */
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { auditApiCall, resolveApiKey, type ApiSession } from "@/lib/mcp/auth";
import { mcpConfigured } from "@/lib/mcp/service";
import * as q from "@/lib/mcp/queries";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { http?: { authInfo?: { extra?: Record<string, unknown> } } };
function session(ctx: Ctx): ApiSession {
  const s = ctx.http?.authInfo?.extra?.session as ApiSession | undefined;
  if (!s) throw new Error("Unauthorized");
  return s;
}
const json = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

const handler = createMcpHandler(
  (server) => {
    server.registerTool("whoami", { title: "Who am I", description: "The organization this API key belongs to, its scopes and demo flag.", inputSchema: z.object({}) }, async (_a, ctx) => {
      const s = session(ctx as Ctx); await auditApiCall(s, "whoami", {});
      return json({ organization: s.orgName, org_id: s.orgId, demo: s.isDemo, timezone: s.timezone, base_currency: s.baseCurrency, scopes: s.scopes, key: s.keyPrefix, read_only: true });
    });
    server.registerTool("get_overview", { title: "Overview", description: "Counts and totals for a period: movements, unidentified, unmatched, proposed, matched, approved, received/paid by token (exact), open exceptions, exports, wallets with their verification status.", inputSchema: z.object({ from: date.optional(), to: date.optional() }) }, async (a, ctx) => {
      const s = session(ctx as Ctx); await auditApiCall(s, "get_overview", a); return json(await q.overview(s, a.from, a.to));
    });
    server.registerTool("list_movements", { title: "List movements", description: "Stablecoin transfers of the organization with their identification, reconciliation and review status. Amounts are exact decimal strings.", inputSchema: z.object({ from: date.optional(), to: date.optional(), direction: z.enum(["in", "out"]).optional(), reconciliation: z.enum(["unmatched", "proposed", "matched", "not_applicable"]).optional(), review: z.enum(["pending", "correction_requested", "approved"]).optional(), limit: z.number().int().min(1).max(200).optional() }) }, async (a, ctx) => {
      const s = session(ctx as Ctx); await auditApiCall(s, "list_movements", a); return json(await q.listMovements(s, a));
    });
    server.registerTool("get_movement", { title: "Movement detail", description: "One movement with its financial context revisions, match proposals (with named signals), exceptions, valuations and audit trail.", inputSchema: z.object({ id: z.string().uuid() }) }, async (a, ctx) => {
      const s = session(ctx as Ctx); await auditApiCall(s, "get_movement", a); const m = await q.getMovement(s, a.id); return json(m ?? { error: "not found in this organization" });
    });
    server.registerTool("list_reconciliation_queue", { title: "Reconciliation queue", description: "Pending match proposals: movement, candidate invoice, the named signals that support the match and the differences. Nothing is accepted automatically; an operator decides in the app.", inputSchema: z.object({ limit: z.number().int().min(1).max(200).optional() }) }, async (a, ctx) => {
      const s = session(ctx as Ctx); await auditApiCall(s, "list_reconciliation_queue", a); return json(await q.reconciliationQueue(s, a.limit));
    });
    server.registerTool("list_exceptions", { title: "Exceptions", description: "Movements that need a human: kind, reason, owner, resolution. Open ones by default.", inputSchema: z.object({ status: z.enum(["open", "waiting", "resolved"]).optional(), limit: z.number().int().min(1).max(200).optional() }) }, async (a, ctx) => {
      const s = session(ctx as Ctx); await auditApiCall(s, "list_exceptions", a); return json(await q.listExceptions(s, a.status, a.limit));
    });
    server.registerTool("list_wallets", { title: "Wallets", description: "Declared wallets with their legal entity, whether legal identity is verified (qualified certificate) and control proven (wallet signature), sync state, and the URL to verify in the app. Verification itself happens in the browser (AutoFirma, Phantom), never through this API.", inputSchema: z.object({}) }, async (_a, ctx) => {
      const s = session(ctx as Ctx); await auditApiCall(s, "list_wallets", {}); return json(await q.listWallets(s));
    });
    server.registerTool("get_wallet_evidence", { title: "Wallet ownership evidence", description: "Attestations of a wallet: method (certificate or wallet key), status, signer identity (as recorded), chain of trust, OCSP result, reasons, links between the two proofs.", inputSchema: z.object({ wallet_id: z.string().uuid() }) }, async (a, ctx) => {
      const s = session(ctx as Ctx); await auditApiCall(s, "get_wallet_evidence", a); return json(await q.walletEvidence(s, a.wallet_id));
    });
    server.registerTool("list_exports", { title: "Exports", description: "Period closes: record count, SHA-256 checksum, Solana anchor (signature and explorer URL) and download URL.", inputSchema: z.object({ limit: z.number().int().min(1).max(200).optional() }) }, async (a, ctx) => {
      const s = session(ctx as Ctx); await auditApiCall(s, "list_exports", a); return json(await q.listExports(s, a.limit));
    });
  },
  { serverInfo: { name: "web3rails", version: "0.1.0" } },
);

const authed = withMcpAuth(
  handler,
  async (_req, bearer) => {
    if (!mcpConfigured()) return undefined;
    const s = await resolveApiKey(bearer);
    if (!s) return undefined;
    return { token: bearer!, clientId: s.keyPrefix, scopes: s.scopes, extra: { session: s } };
  },
  { required: true, requiredScopes: ["read"] },
);

export { authed as GET, authed as POST, authed as DELETE };
