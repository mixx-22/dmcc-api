import { Role, defaultPermissions } from "../roles/role.model.js";

const deepMerge = (target = {}, source = {}) => {
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = target[key];
    if (srcVal && typeof srcVal === "object" && !Array.isArray(srcVal)) {
      target[key] = deepMerge(
        typeof tgtVal === "object" && !Array.isArray(tgtVal) ? tgtVal : {},
        srcVal,
      );
    } else {
      target[key] = srcVal;
    }
  }
  return target;
};

const postRole = async (req, res) => {
  try {
    const { title, description, permission, permissions, isSystemRole } =
      req.body;
    const perms = permission ?? permissions; // accept either key

    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ message: "Title is required." });
    }

    // Permissions are optional, use defaults if not provided
    let finalPermissions = JSON.parse(JSON.stringify(defaultPermissions));

    if (perms && typeof perms === "object" && !Array.isArray(perms)) {
      // Deep merge provided permissions with defaults
      finalPermissions = deepMerge(finalPermissions, perms);
    }

    const existingRole = await Role.findOne({ title: title.trim() });
    if (existingRole) {
      return res.status(400).json({ message: "Role already exists." });
    }

    const role = await Role.create({
      title: title.trim(),
      description,
      permissions: finalPermissions,
      isSystemRole: isSystemRole ?? false,
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
    // pagination
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const maxLimit = 100;
    let limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
    if (limit > maxLimit) limit = maxLimit;

    // keyword search (title OR description)
    const keyword = (req.query.keyword ?? req.query.q ?? "").toString().trim();
    const filter = {};
    if (keyword) {
      const re = new RegExp(keyword, "i");
      filter.$or = [{ title: re }, { description: re }];
    }

    const total = await Role.countDocuments(filter);
    const totalPages = Math.ceil(total / limit) || 1;

    const data = await Role.find(filter)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    res.status(200).json({
      data,
      meta: { total, page, limit, totalPages },
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error.",
      error: error.message,
    });
  }
};

const getRole = async (req, res) => {
  try {
    const data = await Role.findById(req.params.id);
    if (!data) {
      return res.status(404).json({ message: "Role not found." });
    }
    res.status(200).json({ data });
  } catch (error) {
    res.status(500).json({
      message: "Server error.",
      error: error.message,
    });
  }
};

const putRole = async (req, res) => {
  try {
    if (Object.keys(req.body).length === 0) {
      return res.status(400).json({ message: "No data provided for update." });
    }

    console.log(
      `[putRole] id=${req.params.id} bodyKeys=${Object.keys(req.body).join(
        ",",
      )}`,
    );

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
        incomingPerms,
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

const deleteRole = async (req, res) => {
  try {
    const role = await Role.findById(req.params.id);

    if (!role) {
      return res.status(404).json({ message: "Role not found." });
    }

    console.log(`Attempting to delete role ${role.title} (ID: ${role._id})`);

    const deleted = await Role.findByIdAndDelete(req.params.id);

    res.status(200).json({
      message: "Role deleted successfully.",
      role: deleted,
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error.",
      error: error.message,
    });
  }
};

export { postRole, getAllRoles, getRole, putRole, deleteRole };
