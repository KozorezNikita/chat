import { Router } from "express";
import { z } from "zod";
import { toggleReactionSchema } from "@chat/shared";

import { validate } from "../middlewares/validate.js";
import { requireAuth } from "../middlewares/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as reactionController from "../controllers/reaction.controller.js";

/**
 * Reaction-роутер mounted під `/api/v1/messages/:messageId/reactions`.
 * mergeParams: true щоб мати доступ до :messageId з parent.
 */
const router = Router({ mergeParams: true });

router.use(asyncHandler(requireAuth));

const messageIdParamSchema = z.object({
  messageId: z.string().min(1),
});

router.post(
  "/",
  validate({ params: messageIdParamSchema, body: toggleReactionSchema }),
  asyncHandler(reactionController.toggleReaction),
);

export { router as reactionRouter };
