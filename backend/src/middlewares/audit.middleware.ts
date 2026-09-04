import { AuthenticatedRequest } from "./auth.middleware.js";
import { prisma } from "../core/prisma.client.js";

export async function logAuditEvent(
  req: AuthenticatedRequest,
  action: string,
  resourceType: string,
  resourceId?: string,
  details?: Record<string, any>
): Promise<void> {
  try {
    const userEmail = req.user?.email || "ANONYMOUS";
    const userId = req.user?.userId;
    const ipAddress = (req as any).ip || req.socket?.remoteAddress || "127.0.0.1";

    await prisma.auditLog.create({
      data: {
        userId,
        userEmail,
        action,
        resourceType,
        resourceId,
        details: details || {},
        ipAddress
      }
    });
  } catch (err) {
    console.error("[AuditLog] Failed to persist audit entry:", err);
  }
}
