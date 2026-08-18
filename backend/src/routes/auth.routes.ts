import { Router } from "express";
import { AuthController } from "../controllers/auth.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { authRateLimiter } from "../middlewares/rate-limiter.middleware.js";
import { validateBody, authSchemas } from "../middlewares/validation.middleware.js";

const router = Router();

router.post("/login", authRateLimiter, validateBody(authSchemas.login), AuthController.login);
router.post("/logout", authMiddleware, AuthController.logout);
router.get("/me", authMiddleware, AuthController.me);
router.post("/change-password", authMiddleware, validateBody(authSchemas.changePassword), AuthController.changePassword);
router.post("/2fa/setup", authMiddleware, AuthController.setup2FA);
router.post("/2fa/enable", authMiddleware, validateBody(authSchemas.verify2FA), AuthController.verifyAndEnable2FA);
router.post("/2fa/disable", authMiddleware, validateBody(authSchemas.disable2FA), AuthController.disable2FA);

export default router;
