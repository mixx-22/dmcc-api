import mongoose, { Schema } from "mongoose";

const DocumentSchema = new Schema({
  title: { type: String, required: true },
  description: { type: String },
  type: { type: String },
  status: { type: String, default: 'draft' },
  parentId: { type: Schema.Types.ObjectId, ref: 'Document' },
  path: { type: String },
  Owner: {
    type: { type: String },
    Id: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  privacy: {
    users: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    teams: [{ type: Schema.Types.ObjectId, ref: 'Team' }],
    roles: [{ type: Schema.Types.ObjectId, ref: 'Roles' }],
  },
  permissionOverrides: {
    readOnly: { type: Boolean, default: false },
    restricted: { type: Boolean, default: false }
  },
  author: { type: Schema.Types.ObjectId, ref: 'User' },

  file: {
    originalName: { type: String },
    storageName: { type: String },
    path: { type: String },
    size: { type: Number },
    mimeType: { type: String }
  },

  encryptedId: { type: String }
}, { timestamps: true });

export const documents = mongoose.model("Document", DocumentSchema);