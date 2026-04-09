import mongoose, { Schema } from "mongoose";

// Default permissions structure
const defaultPermissions = {
  users: { c: 0, r: 0, u: 0, d: 0 },
  teams: {
    c: 0,
    r: 0,
    u: 0,
    d: 0,
    permission: {
      objective: { c: 0, r: 0, u: 0, d: 0 },
    },
  },
  document: {
    c: 0,
    r: 0,
    u: 0,
    d: 0,
    permission: {
      archive: { c: 0, r: 0, u: 0, d: 0 },
      download: { c: 0, r: 0, u: 0, d: 0 },
      preview: { c: 0, r: 0, u: 0, d: 0 },
    },
  },
  request: {
    c: 0,
    r: 0,
    u: 0,
    d: 0,
    permission: {
      publish: { c: 0, r: 0, u: 0, d: 0 },
    },
  },
  audit: { c: 0, r: 0, u: 0, d: 0 },
  settings: {
    c: 0,
    r: 0,
    u: 0,
    d: 0,
    permission: {
      roles: { c: 0, r: 0, u: 0, d: 0 },
      fileType: { c: 0, r: 0, u: 0, d: 0 },
    },
  },
};

const ROLE_TYPES = ["admin", "qmr", "auditor", "teamLeader"];

const roleSchema = new Schema(
  {
    title: { type: String, required: true, unique: true, trim: true },
    description: { type: String, default: "" },

    // store arbitrary nested permission structures
    permissions: {
      type: Schema.Types.Mixed,
      default: () => ({ ...defaultPermissions }),
    },

    isSystemRole: { type: Boolean, default: false },

    // Functional type tags used to identify the role's purpose for notifications
    // and other system features.  A role can carry zero or more of these tags.
    roleTypes: {
      type: [
        {
          type: String,
          enum: ROLE_TYPES,
        },
      ],
      default: [],
    },
  },

  { timestamps: true },
);

export const Role = mongoose.model("Role", roleSchema);
export { defaultPermissions, ROLE_TYPES };
