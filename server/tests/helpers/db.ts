/**
 * Re-export prisma instance для тестів.
 *
 * Чому окремий файл: щоб тести імпортували з одного місця і
 * не лізли вглиб src/. Якщо колись додамо test-spy-обгортку
 * над prisma — поміняємо тут.
 */
export { prisma } from "../../src/db/prisma.js";
