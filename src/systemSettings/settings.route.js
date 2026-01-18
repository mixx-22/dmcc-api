import { Router } from "express";
import {
  postSetting,
  getSettings,
  updateSettings,
} from "./settings.controller.js";
import { authenticate } from "../users/user.controller.js";

const router = Router();

router
  .route("")
  .post(authenticate, postSetting)
  .get(authenticate, getSettings)
  .put(authenticate, updateSettings);

export default router;
