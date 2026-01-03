import { Router } from "express";
import {
  registerUser,
  getAllUsers,
  getUser,
  loginUser,
  logoutUser,
  deleteUser,
} from "./user.controller.js";
const router = Router();

router.route("").post(registerUser);
router.route("").get(getAllUsers);
router.route("/:id").get(getUser);
router.route("/auth/login").post(loginUser);
router.route("/auth/logout").post(logoutUser);
router.route("/:id").delete(deleteUser);

export default router;
