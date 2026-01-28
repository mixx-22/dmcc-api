import { Router } from "express";
import {
  postRequest,
  putRequestSubmit,
  getAllRequest,
  getRequest,
  putRequestApproved,
  putRequestReject,
  putRequestDiscard,
  putRequestPublish,
} from "./request.controller.js";
import { authenticate } from "../users/user.controller.js";

const router = Router();

router.route("").post(authenticate, postRequest);
router.route("").get(authenticate, getAllRequest);
router.route("/:id").get(authenticate, getRequest);
router.route("/:id/submit").put(authenticate, putRequestSubmit);
router.route("/:id/approve").put(authenticate, putRequestApproved);
router.route("/:id/reject").put(authenticate, putRequestReject);
router.route("/:id/discard").put(authenticate, putRequestDiscard);
router.route("/:id/publish").put(authenticate, putRequestPublish);

export default router;
