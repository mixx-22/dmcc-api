import mongoose, { Schema } from "mongoose";

const settingsSchema = new Schema(
  {
    teamLeaderRole: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
    minimize: false,
  },
);

export const Settings = mongoose.model("Settings", settingsSchema);
