import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { ServiceRegistry } from '../core/service.registry.js';

export class AdaptersController {
  public static list(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
    try {
      const metadata = ServiceRegistry.getInstance().getAllMetadata();
      res.status(200).json({ adapters: metadata });
    } catch (err) {
      next(err);
    }
  }

  public static getByType(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
    try {
      const { type } = req.params;
      const adapter = ServiceRegistry.getInstance().getAdapter(type);
      res.status(200).json({ adapter: adapter.getMetadata() });
    } catch (err: any) {
      res.status(404).json({ error: 'ADAPTER_NOT_FOUND', message: err.message });
    }
  }
}
