import { Router } from "express";
import multer from "multer";
import {
  createDirectChatSchema,
  createGroupChatSchema,
  updateGroupChatSchema,
  addChatMemberSchema,
  markAsReadSchema,
  chatIdParamSchema,
  chatMemberParamSchema,
  sendMessageSchema,
  getMessagesQuerySchema,
} from "@chat/shared";

import { validate } from "../middlewares/validate.js";
import { requireAuth } from "../middlewares/auth.js";
import { requireChatMembership } from "../middlewares/chatMembership.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as chatController from "../controllers/chat.controller.js";
import * as messageController from "../controllers/message.controller.js";
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from "../services/upload.service.js";

/**
 * Multer instance для file uploads.
 * memoryStorage — buffer у RAM, ми одразу stream у S3.
 * fileFilter — mime whitelist + 20 MB limit.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    // MediaRecorder надсилає mime з codec суфіксом ("audio/webm;codecs=opus").
    // Нормалізуємо до базового перед перевіркою whitelist.
    const baseMime = file.mimetype.split(";")[0]?.trim() ?? file.mimetype;
    if (ALLOWED_MIME_TYPES.has(file.mimetype) || ALLOWED_MIME_TYPES.has(baseMime)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

const router = Router();

/**
 * ============================================
 * Chat routes
 * ============================================
 *
 * Усі роути потребують auth. Для роутів з :chatId — додатково
 * requireChatMembership middleware.
 *
 * NB: requireAuth у Iter 1 повертає void, але обертаємо asyncHandler
 * щоб помилки з нього (DB lookup) попадали в errorHandler.
 */

// Усі роути потребують auth
router.use(asyncHandler(requireAuth));

// ============================================
// List + create
// ============================================

router.get("/", asyncHandler(chatController.getChats));

router.post(
  "/direct",
  validate({ body: createDirectChatSchema }),
  asyncHandler(chatController.createDirectChat),
);

router.post(
  "/group",
  validate({ body: createGroupChatSchema }),
  asyncHandler(chatController.createGroupChat),
);

// ============================================
// Single chat — /chats/:chatId
// ============================================

router.get(
  "/:chatId",
  validate({ params: chatIdParamSchema }),
  asyncHandler(requireChatMembership),
  asyncHandler(chatController.getChat),
);

router.patch(
  "/:chatId",
  validate({ params: chatIdParamSchema, body: updateGroupChatSchema }),
  asyncHandler(requireChatMembership),
  asyncHandler(chatController.updateChat),
);

router.delete(
  "/:chatId",
  validate({ params: chatIdParamSchema }),
  asyncHandler(requireChatMembership),
  asyncHandler(chatController.deleteChat),
);

// ============================================
// Members
// ============================================

router.post(
  "/:chatId/members",
  validate({ params: chatIdParamSchema, body: addChatMemberSchema }),
  asyncHandler(requireChatMembership),
  asyncHandler(chatController.addMember),
);

router.delete(
  "/:chatId/members/:userId",
  validate({ params: chatMemberParamSchema }),
  asyncHandler(requireChatMembership),
  asyncHandler(chatController.removeMember),
);

// ============================================
// Read marker
// ============================================

router.post(
  "/:chatId/read",
  validate({ params: chatIdParamSchema, body: markAsReadSchema }),
  asyncHandler(requireChatMembership),
  asyncHandler(chatController.markAsRead),
);

// ============================================
// Messages (list + send) — nested під chat для membership-check
// ============================================

router.get(
  "/:chatId/messages",
  validate({ params: chatIdParamSchema, query: getMessagesQuerySchema }),
  asyncHandler(requireChatMembership),
  asyncHandler(messageController.getMessages),
);

router.post(
  "/:chatId/messages",
  validate({ params: chatIdParamSchema, body: sendMessageSchema }),
  asyncHandler(requireChatMembership),
  asyncHandler(messageController.sendMessage),
);

router.post(
  "/:chatId/messages/upload",
  validate({ params: chatIdParamSchema }),
  asyncHandler(requireChatMembership),
  upload.single("file"),
  asyncHandler(messageController.sendMessageWithAttachment),
);

export { router as chatRouter };
