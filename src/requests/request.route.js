import { Router } from "express";
import {
  postRequest,
  putRequestSubmit,
  getAllRequest,
  getRequest,
  putRequestApproved,
  putRequestReject,
  putRequestDiscard,
  putRequestCheckedOut,
  putRequestPublish,
} from "./request.controller.js";
import { authenticate } from "../users/user.controller.js";

const router = Router();

router.route("").post(authenticate, postRequest);
router.route("").get(authenticate, getAllRequest);
router.route("/:id").get(authenticate, getRequest);
router.route("/:id").put(authenticate, (req, res) => {
  const { type } = req.query;

  switch (type) {
    case "submit":
      return putRequestSubmit(req, res);
    case "approve":
      return putRequestApproved(req, res);
    case "reject":
      return putRequestReject(req, res);
    case "discard":
      return putRequestDiscard(req, res);
    case "checked-out":
      return putRequestCheckedOut(req, res);
    case "publish":
      return putRequestPublish(req, res);
    default:
      return res.status(400).json({ message: "Invalid request type" });
  }
});

router.route("/submit/:id").put(authenticate, putRequestSubmit);
router.route("/approve/:id").put(authenticate, putRequestApproved);
router.route("/reject/:id").put(authenticate, putRequestReject);
router.route("/discard/:id").put(authenticate, putRequestDiscard);
router.route("/checkedout/:id").put(authenticate, putRequestCheckedOut);
router.route("/publish/:id").put(authenticate, putRequestPublish);

export default router;

// /requests/:id?type=submit
// /requests/:id?type=approve
// /requests/:id?type=reject
// /requests/:id?type=discard
// /requests/:id?type=publish
