import { Router } from "express";
import { searchMessagesQuerySchema } from "@chat/shared";

import { validate } from "../middlewares/validate.js";
import { requireAuth } from "../middlewares/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as searchController from "../controllers/search.controller.js";

const router = Router();

router.use(asyncHandler(requireAuth));

router.get(
  "/messages",
  validate({ query: searchMessagesQuerySchema }),
  asyncHandler(searchController.searchMessages),
);

export { router as searchRouter };
