import { Role } from "../roles/role.model.js";

const postRole = async (req, res) => {
  try {
    const { title, description, permission, permissions } = req.body;
    const perms = permission ?? permissions; // accept either key

    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ message: "Title is required." });
    }

    if (!perms || typeof perms !== "object" || Array.isArray(perms)) {
      return res
        .status(400)
        .json({ message: "permission must be a non-empty object." });
    }

    const existingRole = await Role.findOne({ title: title.trim() });
    if (existingRole) {
      return res.status(400).json({ message: "Role already exists." });
    }

    const role = await Role.create({
      title: title.trim(),
      description,
      permissions: perms,
    });

    res.status(201).json({
      message: "Role registered successfully.",
      role: {
        id: role._id,
        title: role.title,
        description: role.description,
        permissions: role.permissions,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error.", error: error.message });
  }
};

const getAllRoles = async (req, res) => {
  try {
    const roles = await Role.find({});
    res.status(200).json({ roles });
  } catch (error) {
    res.status(500).json({
      message: "Server error.",
      error: error.message,
    });
  }
};

const getRole = async (req, res) => {
  try {
    const role = await Role.findById(req.params.id);
    if (!role) {
      return res.status(404).json({ message: "Role not found." });
    }
    res.status(200).json({ role });
  } catch (error) {
    res.status(500).json({
      message: "Server error.",
      error: error.message,
    });
  }
};

const deepMerge = (target = {}, source = {}) => {
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = target[key];
    if (srcVal && typeof srcVal === "object" && !Array.isArray(srcVal)) {
      target[key] = deepMerge(
        typeof tgtVal === "object" && !Array.isArray(tgtVal) ? tgtVal : {},
        srcVal
      );
    } else {
      target[key] = srcVal;
    }
  }
  return target;
};

const putRole = async (req, res) => {
  try {
    if (Object.keys(req.body).length === 0) {
      return res.status(400).json({ message: "No data provided for update." });
    }

    const role = await Role.findById(req.params.id);
    if (!role) {
      return res.status(404).json({ message: "Role not found." });
    }

    // support both 'permission' and 'permissions'
    const incomingPerms = req.body.permission ?? req.body.permissions;

    // if permissions provided, deep merge into existing permissions
    if (
      incomingPerms &&
      typeof incomingPerms === "object" &&
      !Array.isArray(incomingPerms)
    ) {
      // create a new merged object so Mongoose detects the change
      const merged = deepMerge(
        JSON.parse(JSON.stringify(role.permissions ?? {})),
        incomingPerms
      );
      role.permissions = merged;
      // ensure mongoose treats this Mixed field as modified
      role.markModified("permissions");
    }

    // apply other updatable fields (exclude permission(s))
    const { permission, permissions, ...other } = req.body;
    Object.keys(other).forEach((k) => {
      role[k] = other[k];
    });

    const saved = await role.save();

    res.status(200).json({
      message: "Role updated successfully.",
      role: saved,
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error.",
      error: error.message,
    });
  }
};

export { postRole, getAllRoles, getRole, putRole };
