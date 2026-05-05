import { Router } from "express";
import { z } from "zod";
import { editMessageSchema } from "@chat/shared";

import { validate } from "../middlewares/validate.js";
import { requireAuth } from "../middlewares/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as messageController from "../controllers/message.controller.js";

const router = Router();

router.use(asyncHandler(requireAuth));

const messageIdParamSchema = z.object({
  messageId: z.string().min(1),
});

/**
 * Окремі повідомлення — edit/delete за messageId без chatId у URL.
 * Membership-check у сервісі (через chatId з повідомлення).
 */

router.patch(
  "/:messageId",
  validate({ params: messageIdParamSchema, body: editMessageSchema }),
  asyncHandler(messageController.editMessage),
);

router.delete(
  "/:messageId",
  validate({ params: messageIdParamSchema }),
  asyncHandler(messageController.deleteMessage),
);

export { router as messageRouter };
