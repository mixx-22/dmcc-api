import mongoose, { Schema } from "mongoose";

const teamStatSchema = new Schema(
  {
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: true,
    },

    files: {
      type: [String],
      default: [],
    },

    pending: {
      type: [String],
      default: [],
    },

    usedStorageBytes: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

export const TeamStat = mongoose.model("TeamStat", teamStatSchema);
