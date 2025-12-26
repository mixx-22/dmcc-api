import { Router } from "express";
import {
  registerUser,
  getAllUsers,
  loginUser,
  logoutUser,
} from "./user.controller.js";
const router = Router();

router.route("").post(registerUser);
router.route("").get(getAllUsers);
router.route("/:id").get(getAllUsers);
router.route("/auth/login").post(loginUser);
router.route("/auth/logout").post(logoutUser);

export default router;
