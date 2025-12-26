import { User } from "./user.model.js";
import jwt from "jsonwebtoken";
import { Role } from "../roles/role.model.js";

const resolveRoleTitles = async (role) => {
  if (!role) return null;
  if (Array.isArray(role)) {
    if (role.length === 0) return [];
    if (typeof role[0] === "object" && role[0]?.title) {
      return role.map((r) => r.title);
    }
    const roles = await Role.find({ _id: { $in: role } }).select("title");
    return roles.map((r) => r.title);
  } else {
    if (typeof role === "object" && role?.title) return role.title;
    const roleDoc = await Role.findById(role).select("title");
    return roleDoc ? roleDoc.title : null;
  }
};

const mergeDeep = (target = {}, source = {}) => {
  const out = { ...(target ?? {}) };
  for (const key of Object.keys(source ?? {})) {
    const srcVal = source[key];
    const tgtVal = out[key];

    // If both are plain objects, merge recursively
    if (srcVal && typeof srcVal === "object" && !Array.isArray(srcVal)) {
      out[key] = mergeDeep(
        tgtVal && typeof tgtVal === "object" && !Array.isArray(tgtVal)
          ? tgtVal
          : {},
        srcVal
      );
      continue;
    }

    // If both are numeric flags (0/1 or other numbers), combine by taking the max (equivalent to OR for 0/1)
    if (typeof srcVal === "number" && typeof tgtVal === "number") {
      out[key] = Math.max(tgtVal, srcVal);
      continue;
    }

    // default: source wins
    out[key] = srcVal;
  }
  return out;
};

const getPermissionsFromRoles = async (role) => {
  let rolePermissions = {};
  if (!role) return rolePermissions;

  if (Array.isArray(role)) {
    if (role.length === 0) return rolePermissions;
    if (typeof role[0] === "object") {
      for (const r of role) {
        const perms = r.permissions ?? r.permission ?? {};
        rolePermissions = mergeDeep(rolePermissions, perms);
      }
    } else {
      const roles = await Role.find({ _id: { $in: role } }).select(
        "permissions"
      );
      for (const r of roles) {
        const perms = r.permissions ?? r.permission ?? {};
        rolePermissions = mergeDeep(rolePermissions, perms);
      }
    }
  } else {
    if (typeof role === "object") {
      rolePermissions = mergeDeep(
        rolePermissions,
        role.permissions ?? role.permission ?? {}
      );
    } else {
      const roleDoc = await Role.findById(role).select("permissions");
      rolePermissions = mergeDeep(
        rolePermissions,
        roleDoc ? roleDoc.permissions ?? roleDoc.permission ?? {} : {}
      );
    }
  }
  return rolePermissions;
};

const registerUser = async (req, res) => {
  try {
    console.log("registerUser body:", req.body);

    const {
      employeeId,
      position,
      firstName,
      middleName,
      lastName,
      username,
      password,
      email,
      role,
      team,
      permissionsOverride,
      permission,
      permissions,
      permissionOverride,
    } = req.body;

    const perms =
      permissionsOverride ??
      permissionOverride ??
      permission ??
      permissions ??
      {};
    console.log("resolved perms:", JSON.stringify(perms));

    if (typeof perms !== "object" || Array.isArray(perms)) {
      return res
        .status(400)
        .json({ message: "permissionsOverride must be an object." });
    }

    if (
      !employeeId ||
      !position ||
      !firstName ||
      !lastName ||
      !username ||
      !password ||
      !email
    ) {
      return res.status(400).json({ message: "All fields are required." });
    }

    const existingUser = await User.findOne({
      $or: [{ employeeId }, { username }, { email }],
    });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "Employee ID, username, or email already in use." });
    }

    const user = await User.create({
      employeeId,
      position,
      firstName,
      middleName,
      lastName,
      username,
      password,
      email: email.toLowerCase(),
      role,
      team,
      permissionsOverride: perms,
    });

    user.markModified("permissionsOverride");
    await user.save();

    console.log("created user (saved):", user.toObject());

    res.status(201).json({
      message: "User registered successfully.",
      user: {
        id: user._id,
        employeeId: user.employeeId,
        position: user.position,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        email: user.email,
        role: user.role,
        team: user.team,
        permissionsOverride: user.permissionsOverride,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error.", error: error.message });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const maxLimit = 100;
    let limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
    if (limit > maxLimit) limit = maxLimit;

    const keyword = (req.query.keyword ?? req.query.q ?? "").toString().trim();
    const filter = { deletedAt: null };
    if (keyword) {
      const re = new RegExp(keyword, "i");
      filter.$or = [
        { firstName: re },
        { lastName: re },
        { email: re },
        { username: re },
        { employeeId: re },
      ];
    }

    const total = await User.countDocuments(filter);
    const totalPages = Math.max(Math.ceil(total / limit), 1);
    const pageClamped = Math.min(Math.max(page, 1), totalPages);

    // exclude password and __v
    const users = await User.find(filter)
      .select("-password -__v")
      .skip((pageClamped - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 })
      .lean();

    // resolve role titles
    const roleIds = [
      ...new Set(
        users.flatMap((u) =>
          Array.isArray(u.role) ? u.role : u.role ? [u.role] : []
        )
      ),
    ].filter(Boolean);
    let roleMap = {};
    if (roleIds.length) {
      const roles = await Role.find({ _id: { $in: roleIds } })
        .select("title")
        .lean();
      roleMap = Object.fromEntries(roles.map((r) => [String(r._id), r.title]));
    }

    const data = users.map((u) => {
      const r = u.role;
      let roleTitles = null;

      if (Array.isArray(r))
        roleTitles = r.map((id) => roleMap[String(id)] ?? id);
      else if (r) roleTitles = roleMap[String(r)] ?? r;
      return {
        userId: u._id,
        employeeId: u.employeeId,
        firstName: u.firstName,
        middleName: u.middleName,
        lastName: u.lastName,
        email: u.email,
        role: roleTitles,
        team: u.team,
        isActive: u.isActive,
      };
    });

    res.status(200).json({
      data: data,
      meta: { total, page: pageClamped, limit, totalPages },
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error.",
      error: error.message,
    });
  }
};

const loginUser = async (req, res) => {
  try {
    console.log("loginUser body:", req.body);
    const { usernameOrEmail, username, email, password } = req.body ?? {};

    const identifier = usernameOrEmail ?? username ?? email;
    if (!identifier || !password) {
      console.log("Bad login request headers:", req.headers);
      return res.status(400).json({
        message:
          "usernameOrEmail (or username/email) and password are required.",
      });
    }

    const user = await User.findOne({
      $or: [{ username: identifier }, { email: identifier }],
    });
    if (!user) return res.status(400).json({ message: "Invalid credentials." });

    const isValid = await user.validatePassword(password);
    if (!isValid)
      return res.status(400).json({ message: "Invalid credentials." });

    user.lastLoginAt = new Date();
    await user.save();

    const payload = {
      id: String(user._id),
      username: user.username,
      role: user.role,
    };

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error("JWT_SECRET not set");
      return res.status(500).json({
        message: "Server misconfiguration.",
        error: "JWT_SECRET not set",
      });
    }

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "1h",
    });

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: parseInt(process.env.JWT_MAX_AGE || "3600", 10) * 1000, // seconds -> ms
    });

    let roleTitle = null;
    try {
      roleTitle = await resolveRoleTitles(user.role);
    } catch (err) {
      console.error("Failed to resolve role title:", err);
    }

    const rolePermissions = await getPermissionsFromRoles(user.role);
    const overridePermissions = user.permissionsOverride ?? {};
    const combinedPermissions = mergeDeep(rolePermissions, overridePermissions);

    res.status(200).json({
      message: "Login successful.",
      user: {
        id: user._id,
        employeeId: user.employeeId,
        position: user.position,
        firstName: user.firstName,
        middleName: user.middleName,
        lastName: user.lastName,
        username: user.username,
        email: user.email,
        role: roleTitle,
        team: user.team,
        permissions: combinedPermissions,
        permissionsOverride: user.permissionsOverride,
        token: token,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error.", error: error.message });
  }
};

const logoutUser = async (req, res) => {
  try {
    res.clearCookie("token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });

    const { usernameOrEmail } = req.body;

    const user = await User.findOne({
      $or: [{ username: usernameOrEmail }, { email: usernameOrEmail }],
    });

    if (!user) {
      return res.status(400).json({ message: "User not found." });
    }

    res.status(200).json({ message: "Logout successful." });
  } catch (error) {
    res.status(500).json({ message: "Server error.", error: error.message });
  }
};

export const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1] ?? req.cookies?.token;
  if (!token) return res.status(401).json({ message: "Unauthorized" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id);
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
};

export { registerUser, getAllUsers, loginUser, logoutUser };
