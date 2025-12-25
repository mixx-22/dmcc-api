import { Role } from "../roles/role.model.js";

const registerRole = async (req, res) => {
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

export { registerRole };
