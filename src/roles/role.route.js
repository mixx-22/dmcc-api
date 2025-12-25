import { Router } from "express";
import { registerRole } from "../roles/role.controller.js";
const router = Router();

router.route("/register-role").post(registerRole);

export default router;
