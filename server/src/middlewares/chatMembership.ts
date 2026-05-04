import type { Request, Response, NextFunction } from "express";

import * as chatRepo from "../repositories/chat.repo.js";
import { ForbiddenError, NotFoundError } from "../utils/HttpError.js";

/**
 * ============================================
 * requireChatMembership middleware
 * ============================================
 *
 * Перевіряє що req.userId є активним членом chat:chatId.
 *
 * Залежить від requireAuth (req.userId має бути встановлений).
 * Витягує chatId з req.params.chatId.
 *
 * Якщо membership знайдено — кладе ChatMember у req.chatMember.
 * Контролер дістає роль звідти без зайвого SQL.
 *
 * Якщо не знайдено:
 *   - чат не існує АБО юзер не member → 403 (не leak-имо чи чат існує)
 *   - юзер left чат → 404 (його там вже нема, він знає що left)
 *
 * 403 vs 404 свідомо: privacy. Якщо повертати 404 для "немає такого чату",
 * це leak що чат існує, але юзер не запрошений. 403 для обох випадків —
 * однакова відповідь, нема enumeration.
 */

export interface ChatMemberContext {
  chatId: string;
  userId: string;
  role: "OWNER" | "MEMBER";
  leftAt: Date | null;
  lastReadMessageId: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Заповнюється requireChatMembership middleware-ом. */
      chatMember: ChatMemberContext;
    }
  }
}

export async function requireChatMembership(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const chatId = String(req.params.chatId ?? "");
    if (!chatId) {
      throw new ForbiddenError("Chat ID required", "CHAT_ID_MISSING");
    }

    const member = await chatRepo.findMembership(chatId, req.userId);

    if (!member) {
      throw new ForbiddenError("Access denied", "NOT_A_MEMBER");
    }

    if (member.leftAt !== null) {
      // Юзер сам left/був видалений — повертаємо NOT_FOUND, бо для нього
      // чату вже не існує. Він знає що left.
      throw new NotFoundError("Chat not found", "CHAT_NOT_FOUND");
    }

    req.chatMember = {
      chatId: member.chatId,
      userId: member.userId,
      role: member.role,
      leftAt: member.leftAt,
      lastReadMessageId: member.lastReadMessageId,
    };

    next();
  } catch (err) {
    next(err);
  }
}
