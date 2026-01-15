import { Router } from "express";
import {
  registerUser,
  getAllUsers,
  getUser,
  putUser,
  deleteUser,
} from "./user.controller.js";
const router = Router();

router.route("").post(registerUser);
router.route("").get(getAllUsers);
router.route("/:id").get(getUser);
router.route("/:id").put(putUser).patch(putUser);
router.route("/:id").delete(deleteUser);

export default router;
