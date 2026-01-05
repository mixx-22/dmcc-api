import { Router } from "express";
import {
  createDocument,
} from "../documents/document.controller.js";
const router = Router();

router.route("").post(createDocument);

module.exports = router;