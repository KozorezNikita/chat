import { createApp } from "../../src/app.js";

/**
 * Один app instance переюзаний усіма тестами.
 *
 * Чому singleton: createApp встановлює middlewares, роути, helmet —
 * це повторювана робота. Один раз створили, всі тести б'ють по цьому
 * самому instance. Express stateless по запитах, тому це безпечно.
 */
export const app = createApp();