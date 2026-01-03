import { Router } from "express";
import { loginUser, logoutUser } from "./user.controller.js";
const router = Router();

router.route("/login").post(loginUser);
router.route("/logout").post(logoutUser);

export default router;
