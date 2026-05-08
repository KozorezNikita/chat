import { logger } from "../utils/logger.js";

/**
 * Child-логер для socket-операцій.
 * У логах побачимо `scope: "socket"` що дозволяє фільтрувати у production.
 */
export const socketLogger = logger.child({ scope: "socket" });
