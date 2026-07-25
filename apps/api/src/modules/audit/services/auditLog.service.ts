import crypto from "crypto";
import { AuditLog } from "../models/auditLog.model";

const SENSITIVE_FIELDS = ["password", "token", "secret", "jwt"];

const redact = (body: unknown): Record<string, unknown> => {
  if (!body || typeof body !== "object") return {};
  const clone: Record<string, unknown> = { ...(body as Record<string, unknown>) };
  for (const key of Object.keys(clone)) {
    if (SENSITIVE_FIELDS.some((f) => key.toLowerCase().includes(f))) {
      clone[key] = "[REDACTED]";
    }
  }
  return clone;
};

const methodToAction = (method: string): "CREATE" | "UPDATE" | "DELETE" => {
  if (method === "POST") return "CREATE";
  if (method === "DELETE") return "DELETE";
  return "UPDATE";
};

// Entity type is the first path segment after /api, e.g. /api/employees/123 -> "employees"
const entityTypeFromPath = (path: string): string => {
  const segments = path.split("?")[0].split("/").filter(Boolean);
  const apiIndex = segments.indexOf("api");
  return segments[apiIndex + 1] || "unknown";
};

// The hash chain is a read-then-write over the tenant's last entry, which is
// not atomic on its own — two requests for the same tenant finishing close
// together can both read the same "last hash" and fork the chain. Since this
// only runs within a single Node process, a per-tenant in-process queue is
// enough to serialize the read+write and keep the chain linear.
const tenantQueues = new Map<string, Promise<void>>();

const enqueuePerTenant = (tenantId: string, task: () => Promise<void>): Promise<void> => {
  const previous = tenantQueues.get(tenantId) ?? Promise.resolve();
  const next = previous.then(task, task);
  tenantQueues.set(tenantId, next.catch(() => {}));
  return next;
};

export const recordAuditEntry = (entry: {
  tenantId: string;
  userId?: string;
  method: string;
  path: string;
  statusCode: number;
  ip?: string;
  body?: unknown;
}): Promise<void> => enqueuePerTenant(entry.tenantId, () => writeAuditEntry(entry));

const writeAuditEntry = async (entry: {
  tenantId: string;
  userId?: string;
  method: string;
  path: string;
  statusCode: number;
  ip?: string;
  body?: unknown;
}): Promise<void> => {
  const action = methodToAction(entry.method);
  const entityType = entityTypeFromPath(entry.path);
  const metadata = redact(entry.body);

  const last = await AuditLog.findOne({ tenantId: entry.tenantId })
    .sort({ createdAt: -1 })
    .select("hash")
    .lean();
  const previousHash = last?.hash ?? null;

  const timestamp = new Date().toISOString();
  const hash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        tenantId: entry.tenantId,
        userId: entry.userId,
        action,
        entityType,
        method: entry.method,
        path: entry.path,
        statusCode: entry.statusCode,
        timestamp,
        previousHash,
      })
    )
    .digest("hex");

  await AuditLog.create({
    tenantId: entry.tenantId,
    userId: entry.userId,
    action,
    entityType,
    method: entry.method,
    path: entry.path,
    statusCode: entry.statusCode,
    ip: entry.ip,
    metadata,
    previousHash,
    hash,
    createdAt: timestamp,
  });
};

export interface ChainVerification {
  valid: boolean;
  brokenAtId?: string;
  checked: number;
}

// Recomputes each entry's hash from its stored fields and compares against
// the chain — confirms nothing was edited or deleted out of order.
export const verifyChain = async (tenantId: string): Promise<ChainVerification> => {
  const entries = await AuditLog.find({ tenantId }).sort({ createdAt: 1 }).lean();

  let expectedPrevious: string | null = null;
  for (const entry of entries) {
    if ((entry.previousHash ?? null) !== expectedPrevious) {
      return { valid: false, brokenAtId: String(entry._id), checked: entries.length };
    }

    const recomputed = crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          tenantId: String(entry.tenantId),
          userId: entry.userId ? String(entry.userId) : undefined,
          action: entry.action,
          entityType: entry.entityType,
          method: entry.method,
          path: entry.path,
          statusCode: entry.statusCode,
          timestamp: new Date(entry.createdAt as Date).toISOString(),
          previousHash: entry.previousHash ?? null,
        })
      )
      .digest("hex");

    if (recomputed !== entry.hash) {
      return { valid: false, brokenAtId: String(entry._id), checked: entries.length };
    }

    expectedPrevious = entry.hash;
  }

  return { valid: true, checked: entries.length };
};
