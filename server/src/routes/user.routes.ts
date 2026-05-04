import { Router } from "express";
import { searchUsersQuerySchema } from "@chat/shared";

import { validate } from "../middlewares/validate.js";
import { requireAuth } from "../middlewares/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as userController from "../controllers/user.controller.js";

const router = Router();

router.use(asyncHandler(requireAuth));

router.get(
  "/search",
  validate({ query: searchUsersQuerySchema }),
  asyncHandler(userController.searchUsers),
);

export { router as userRouter };
