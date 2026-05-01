import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

/**
 * Liveness probe — сервер запущений.
 * Не перевіряє жодних downstream-залежностей.
 * Використовується платформою (Render/Railway) для restart-логіки.
 */
router.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

/**
 * Readiness probe — сервер готовий обробляти запити.
 * Перевіряє з'єднання з БД. Якщо БД лежить — 503.
 *
 * Платформа може використовувати для traffic-routing
 * (не слати запити поки readiness не OK).
 */
router.get(
  "/ready",
  asyncHandler(async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ready", timestamp: new Date().toISOString() });
  }),
);

export { router as healthRouter };
