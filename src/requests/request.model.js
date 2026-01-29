import mongoose from "mongoose";

const approvalSchema = new mongoose.Schema(
  {
    documentId: {
      type: String,
      default: "",
    },
    title: {
      type: String,
      default: "",
    },
    description: {
      type: String,
      default: "",
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    type: {
      type: String,
      default: "",
    },
    status: {
      type: Number,
      default: -1,
      enum: [-2, -1, 0, 1, 2], // -2 Discarded, -1 Working, 0 Under Review, 1 Approved, 2 Published
    },
    mode: {
      type: String,
      default: "",
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    requestedFor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      default: null,
    },
    requestedDate: {
      type: Date,
      default: Date.now,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedDate: {
      type: Date,
      default: null,
    },
    publishedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    publishedDate: {
      type: Date,
      default: null,
    },
    remarks: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

const Request = mongoose.model("Request", approvalSchema);

export default Request;
