import { Router } from "express";
import { getPresenceQuerySchema } from "@chat/shared";

import { validate } from "../middlewares/validate.js";
import { requireAuth } from "../middlewares/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as presenceController from "../controllers/presence.controller.js";

const router = Router();

router.use(asyncHandler(requireAuth));

router.get(
  "/",
  validate({ query: getPresenceQuerySchema }),
  asyncHandler(presenceController.getPresence),
);

export { router as presenceRouter };
