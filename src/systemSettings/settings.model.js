import mongoose, { Schema } from "mongoose";

const settingsSchema = new Schema(
  {
    teamLeaderRole: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Role",
      },
    ],
  },
  {
    timestamps: true,
    minimize: false,
  },
);

export const Settings = mongoose.model("Settings", settingsSchema);
