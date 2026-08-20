import { Router } from 'express';
import authRoutes from './auth.routes.js';
import hostsRoutes from './hosts.routes.js';
import updatesRoutes from './updates.routes.js';
import adaptersRoutes from './adapters.routes.js';
import vaultRoutes from './vault.routes.js';
import auditRoutes from './audit.routes.js';
import settingsRoutes from './settings.routes.js';
import webhookRoutes from './webhook.routes.js';

const apiRouter = Router();

apiRouter.use('/auth', authRoutes);
apiRouter.use('/hosts', hostsRoutes);
apiRouter.use('/updates', updatesRoutes);
apiRouter.use('/adapters', adaptersRoutes);
apiRouter.use('/vault', vaultRoutes);
apiRouter.use('/audit', auditRoutes);
apiRouter.use('/settings', settingsRoutes);
apiRouter.use('/webhooks', webhookRoutes);

export default apiRouter;

