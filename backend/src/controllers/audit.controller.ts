import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { prisma } from '../core/prisma.client.js';

export class AuditController {
  public static async list(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { limit = '50', action, resourceType } = req.query;

      const logs = await prisma.auditLog.findMany({
        where: {
          action: action ? String(action) : undefined,
          resourceType: resourceType ? String(resourceType) : undefined
        },
        orderBy: { createdAt: 'desc' },
        take: parseInt(String(limit), 10)
      });

      res.status(200).json({ logs });
    } catch (err) {
      next(err);
    }
  }
}
