import mongoose, { Schema } from "mongoose";

const standardSchema = new Schema(
  {
    standard: {
      type: String,
      default: "",
    },

    description: {
      type: String,
      default: "",
    },

    clauses: {
      type: [{}],
      default: [],
    },

    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

const Standard = mongoose.model("Standard", standardSchema);

export default Standard;
