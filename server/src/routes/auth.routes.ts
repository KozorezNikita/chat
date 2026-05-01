import { Router } from "express";
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
} from "@chat/shared";

import { validate } from "../middlewares/validate.js";
import { requireAuth } from "../middlewares/auth.js";
import { authLimiter } from "../middlewares/rateLimiter.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as authController from "../controllers/auth.controller.js";

const router = Router();

/**
 * ============================================
 * Auth routes
 * ============================================
 *
 * Композиція middleware: rateLimit → validate → (auth якщо треба) → controller.
 *
 * authLimiter (10 req / 15min на IP) застосовується до всього що може бути
 * brute-force-нуто: register, login, refresh, password reset, email verify,
 * resend verification.
 *
 * logout / logout-all / me — без rate limiter (це не атаковані операції).
 */

// ============================================
// Public routes (без auth, з rate limit)
// ============================================

router.post(
  "/register",
  authLimiter,
  validate({ body: registerSchema }),
  asyncHandler(authController.register),
);

router.post(
  "/login",
  authLimiter,
  validate({ body: loginSchema }),
  asyncHandler(authController.login),
);

router.post(
  "/refresh",
  authLimiter,
  asyncHandler(authController.refresh),
);

router.post(
  "/verify-email",
  authLimiter,
  validate({ body: verifyEmailSchema }),
  asyncHandler(authController.verifyEmail),
);

router.post(
  "/resend-verification",
  authLimiter,
  validate({ body: requestPasswordResetSchema }), // та сама схема — лише {email}
  asyncHandler(authController.resendVerification),
);

router.post(
  "/request-password-reset",
  authLimiter,
  validate({ body: requestPasswordResetSchema }),
  asyncHandler(authController.requestPasswordReset),
);

router.post(
  "/reset-password",
  authLimiter,
  validate({ body: resetPasswordSchema }),
  asyncHandler(authController.resetPassword),
);

// ============================================
// Logout — public (юзер може мати протухший access і все одно хотіти вийти)
// ============================================

router.post(
  "/logout",
  asyncHandler(authController.logout),
);

// ============================================
// Protected routes (вимагають auth)
// ============================================

router.post(
  "/logout-all",
  asyncHandler(requireAuth),
  asyncHandler(authController.logoutAll),
);

router.get(
  "/me",
  asyncHandler(requireAuth),
  asyncHandler(authController.getMe),
);

export { router as authRouter };
