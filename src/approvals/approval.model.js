import mongoose from "mongoose";

const approvalSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      default: "",
      required: true,
    },
    description: {
      type: String,
      default: "",
    },
    metadata: {
      documentNumber: {
        type: String,
        default: "",
      },
      fileName: {
        type: String,
        default: "",
      },
      size: {
        type: String,
        default: "",
      },
      issuedDate: {
        type: Date,
        default: null,
      },
      effectivityDate: {
        type: Date,
        default: null,
      },
      version: {
        type: String,
        default: "",
      },
      retentionPeriod: {
        type: String,
        default: "",
      },
      key: {
        type: String,
        default: "",
      },
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      required: true,
    },
    applicationId: {
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
    approvalDate_DEPARTMENT: {
      type: Date,
      default: null,
    },
    approvalDate_CONTROLLER: {
      type: Date,
      default: null,
    },
    type: {
      type: String,
      default: "",
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    publishedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    status: {
      type: Number,
      default: -1,
      enum: [-1, 0, 1, 2], // -1 Working, 0 Under Review, 1 Approved, 2 Rejected
    },
    mode: {
      type: String,
      default: "Department",
      enum: ["Department", "Document Controller"],
    },
    remarks: {
      type: String,
      default: "",
    },
    otherRemarks: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

const Approval = mongoose.model("Approval", approvalSchema);

export default Approval;
