import { Router } from "express";
import { loginUser, logoutUser, resetPassword, changePassword } from "./user.controller.js";
const router = Router();

router.route("/login").post(loginUser);
router.route("/logout").post(logoutUser);
router.route("/reset-password/:id").post(resetPassword);
router.route("/change-password/:id").post(changePassword);

export default router;
