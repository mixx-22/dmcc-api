import { Router } from "express";
import { postSetting, getSettings } from "./settings.controller.js";
import { authenticate } from "../users/user.controller.js";

const router = Router();

router.route("").post(authenticate, postSetting).get(authenticate, getSettings);

export default router;
