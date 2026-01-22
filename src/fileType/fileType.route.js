import { Router } from "express";
import {
  postFileType,
  getAllFileType,
  getFileType,
  putFileType,
  deleteFileType,
} from "./fileType.controller.js";
import { authenticate } from "../users/user.controller.js";
const router = Router();

router.use((req, res, next) => {
  console.log(`[fileType route] ${req.method} ${req.originalUrl}`);
  next();
});

router.all("/:id", (req, res, next) => {
  console.log(
    `[fileType route matched /:id] ${req.method} id=${req.params.id}`,
  );
  next();
});

router.route("").post(authenticate, postFileType);
router.route("").get(authenticate, getAllFileType);
router.route("/:id").get(authenticate, getFileType);
router
  .route("/:id")
  .put(authenticate, putFileType)
  .patch(authenticate, putFileType);
router.route("/:id").delete(authenticate, deleteFileType);

export default router;
