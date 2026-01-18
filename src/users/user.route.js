import { Router } from "express";
import {
  registerUser,
  getAllUsers,
  getUser,
  putUser,
  deleteUser,
} from "./user.controller.js";
import { authenticate } from "../users/user.controller.js";
const router = Router();

router.route("").post(authenticate, registerUser);
router.route("").get(authenticate, getAllUsers);
router.route("/:id").get(authenticate, getUser);
router.route("/:id").put(authenticate, putUser).patch(authenticate, putUser);
router.route("/:id").delete(authenticate, deleteUser);

export default router;
