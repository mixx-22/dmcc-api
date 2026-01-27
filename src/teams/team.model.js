import mongoose, { Schema } from "mongoose";

const teamSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },

    description: {
      type: String,
      default: "",
    },

    leaders: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    teamDocuments: {
      type: Array,
      ref: "TeamDocuments",
      default: [],
    },

    objectives: [{}],

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    minimize: false,
  },
);

export const Team = mongoose.model("Team", teamSchema);
