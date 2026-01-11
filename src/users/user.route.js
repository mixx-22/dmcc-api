import { Router } from "express";
import {
  registerUser,
  getAllUsers,
  getUser,
  putUser,
  loginUser,
  logoutUser,
  deleteUser,
  changePassword,
  generatePassword,
} from "./user.controller.js";
const router = Router();

router.route("").post(registerUser);
router.route("").get(getAllUsers);
router.route("/auth/login").post(loginUser);
router.route("/auth/logout").post(logoutUser);
router.route("/generate-password/:id").post(generatePassword);
router.route("/change-password/:id").post(changePassword);
router.route("/:id").get(getUser);
router.route("/:id").put(putUser).patch(putUser);
router.route("/:id").delete(deleteUser);

export default router;
