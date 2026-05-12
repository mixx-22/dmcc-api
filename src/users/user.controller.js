import { User } from "./user.model.js";
import jwt from "jsonwebtoken";
import { Role } from "../roles/role.model.js";
import { Team } from "../teams/team.model.js";
import mongoose from "mongoose";
import { generateKey } from "../utils/generateKey.js";
import { postAuditTrailLog } from "../documentLogs/auditTrail/auditTrail.controller.js";

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
        srcVal,
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
        "permissions",
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
        role.permissions ?? role.permission ?? {},
      );
    } else {
      const roleDoc = await Role.findById(role).select("permissions");
      rolePermissions = mergeDeep(
        rolePermissions,
        roleDoc ? (roleDoc.permissions ?? roleDoc.permission ?? {}) : {},
      );
    }
  }
  return rolePermissions;
};

const adminPermissionValue = { c: 1, r: 1, u: 1, d: 1 };

const systemAdministratorPermissions = {
  users: { ...adminPermissionValue },
  teams: {
    ...adminPermissionValue,
    permission: {
      objective: { ...adminPermissionValue },
    },
  },
  document: {
    ...adminPermissionValue,
    permission: {
      archive: { ...adminPermissionValue },
      download: { ...adminPermissionValue },
      preview: { ...adminPermissionValue },
    },
  },
  documents: {
    ...adminPermissionValue,
    permission: {
      download: { ...adminPermissionValue },
      preview: { ...adminPermissionValue },
    },
  },
  request: {
    ...adminPermissionValue,
    permission: {
      publish: { ...adminPermissionValue },
      approval: { ...adminPermissionValue },
    },
  },
  audit: {
    ...adminPermissionValue,
    permission: {
      schedule: { ...adminPermissionValue },
      findings: { ...adminPermissionValue },
      response: { ...adminPermissionValue },
      organizations: { ...adminPermissionValue },
      kpis: { ...adminPermissionValue },
      verify: { ...adminPermissionValue },
    },
  },
  settings: {
    ...adminPermissionValue,
    permission: {
      roles: { ...adminPermissionValue },
      fileType: { ...adminPermissionValue },
    },
  },
};

const seedSystemAdministratorIfUsersEmpty = async () => {
  const userCount = await User.countDocuments({});
  if (userCount > 0) return null;

  const username = process.env.SYSTEM_ADMIN_USERNAME || "admin";
  const password = process.env.SYSTEM_ADMIN_PASSWORD || "Admin@123456";
  const email = process.env.SYSTEM_ADMIN_EMAIL || "admin@auptilyze.local";
  const employeeId = process.env.SYSTEM_ADMIN_EMPLOYEE_ID || "SYS-ADMIN-001";

  let role = await Role.findOne({ title: "System Administrator" });
  if (!role) {
    role = await Role.create({
      title: "System Administrator",
      description: "Full system access account role",
      permissions: systemAdministratorPermissions,
      isSystemRole: true,
      roleTypes: ["admin"],
    });
  } else {
    role.permissions = systemAdministratorPermissions;
    role.isSystemRole = true;
    role.roleTypes = Array.from(new Set([...(role.roleTypes || []), "admin"]));
    role.markModified("permissions");
    await role.save();
  }

  try {
    const user = await User.create({
      employeeId,
      position: "System Administrator",
      firstName: "System",
      middleName: "",
      lastName: "Administrator",
      username,
      password,
      contactNumber: "",
      email: email.toLowerCase(),
      role: [role._id],
      team: [],
      permissionsOverride: systemAdministratorPermissions,
      isActive: true,
      deletedAt: null,
    });

    user.markModified("permissionsOverride");
    await user.save();

    return user;
  } catch (error) {
    if (error?.code === 11000) {
      return User.findOne({
        $or: [{ username }, { email: email.toLowerCase() }, { employeeId }],
      });
    }
    throw error;
  }
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
      contactNumber,
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
      contactNumber,
      email: email.toLowerCase(),
      role,
      team,
      permissionsOverride: perms,
    });

    user.markModified("permissionsOverride");
    await user.save();

    // Create TeamStat for the new user
    try {
      await createTeamStatForUser(user._id);
    } catch (statError) {
      console.error("Error creating team stat for user:", statError);
      // Don't fail user registration if stat creation fails
    }

    // Log user registration to audit trail
    await postAuditTrailLog(
      "C",
      user._id,
      "USERS",
      `User registered: ${user.username}`,
      {
        id: user._id,
        name: `${user.firstName} ${user.lastName}`,
      },
      JSON.stringify({
        employeeId: user.employeeId,
        username: user.username,
        email: user.email,
        role: user.role,
      }),
    );

    // Update role counter(s) when user is registered with roles
    if (role) {
      const roleIds = Array.isArray(role) ? role : [role];
      for (const roleId of roleIds) {
        if (roleId && mongoose.Types.ObjectId.isValid(roleId)) {
          await Role.updateOne({ _id: roleId }, { $inc: { Counter: 1 } });
        }
      }
    }

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
        contactNumber: user.contactNumber,
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
    const andFilters = [];

    if (keyword) {
      const re = new RegExp(keyword, "i");
      andFilters.push({
        $or: [
          { firstName: re },
          { lastName: re },
          { email: re },
          { username: re },
          { employeeId: re },
        ],
      });
    }

    const roleFilter = (req.query.role ?? req.query.roleTitle ?? "")
      .toString()
      .trim();

    if (roleFilter) {
      const roleDoc = await Role.findOne({
        title: new RegExp(roleFilter, "i"),
      })
        .select("_id")
        .lean();

      if (!roleDoc) {
        return res.status(404).json({ message: "Role not found." });
      }

      const roleId = roleDoc._id;
      const roleIdStr = roleId.toString();

      andFilters.push({
        $or: [
          { role: roleId },
          { role: roleIdStr },
          { role: { $elemMatch: { $eq: roleId } } },
          { role: { $elemMatch: { $eq: roleIdStr } } },
        ],
      });
    }

    if (andFilters.length > 0) {
      filter.$and = andFilters;
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

    // resolve role objects with id and title
    const roleIds = [
      ...new Set(
        users.flatMap((u) =>
          Array.isArray(u.role) ? u.role : u.role ? [u.role] : [],
        ),
      ),
    ].filter(Boolean);
    let roleMap = {};
    if (roleIds.length) {
      const roles = await Role.find({ _id: { $in: roleIds } })
        .select("title")
        .lean();
      roleMap = Object.fromEntries(
        roles.map((r) => [String(r._id), { id: r._id, title: r.title }]),
      );
    }

    const data = users.map((u) => {
      const r = u.role;
      let roleObjects = [];

      if (Array.isArray(r) && r.length > 0) {
        roleObjects = r.map((id) => roleMap[String(id)] ?? { id, title: null });
      } else if (r && !Array.isArray(r)) {
        roleObjects = [roleMap[String(r)] ?? { id: r, title: null }];
      }

      return {
        userId: u._id,
        employeeId: u.employeeId,
        firstName: u.firstName,
        middleName: u.middleName,
        lastName: u.lastName,
        contactNumber: u.contactNumber,
        email: u.email,
        role: roleObjects,
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

const getUser = async (req, res) => {
  try {
    const id = req.params.id;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user id." });
    }

    // Retrieve any user (not restricted by role)
    const user = await User.findById(id).select("-password -__v").lean();

    if (!user) return res.status(404).json({ message: "User not found." });

    // Resolve role objects with id and title
    let roleObjects = [];
    if (user.role) {
      const roleIds = Array.isArray(user.role) ? user.role : [user.role];
      const validRoleIds = roleIds.filter(
        (id) => id && mongoose.Types.ObjectId.isValid(id),
      );

      if (validRoleIds.length > 0) {
        const roles = await Role.find({ _id: { $in: validRoleIds } })
          .select("title")
          .lean();
        const roleMap = Object.fromEntries(
          roles.map((r) => [String(r._id), { id: r._id, title: r.title }]),
        );
        roleObjects = validRoleIds.map(
          (id) => roleMap[String(id)] ?? { id, title: null },
        );
      }
    }

    // Resolve team objects with id and name - query teams where user is a member or leader
    const teams = await Team.find({
      $or: [{ members: user._id }, { leaders: user._id }],
    })
      .select("name leaders")
      .lean();

    const teamObjects = teams.map((t) => ({
      id: t._id,
      name: t.name,
      teamLeader:
        t.leaders?.some((leaderId) => String(leaderId) === String(user._id)) ||
        false,
    }));

    const rolePermissions = await getPermissionsFromRoles(user.role);
    const overridePermissions = user.permissionsOverride ?? {};
    const combinedPermissions = mergeDeep(rolePermissions, overridePermissions);

    res.status(200).json({
      user: {
        id: user._id,
        employeeId: user.employeeId,
        position: user.position,
        firstName: user.firstName,
        middleName: user.middleName,
        lastName: user.lastName,
        username: user.username,
        contactNumber: user.contactNumber,
        email: user.email,
        role: roleObjects,
        team: teamObjects,
        isActive: user.isActive,
        // permissions: combinedPermissions,
        permissionsOverride: user.permissionsOverride ?? {},
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error.", error: error.message });
  }
};

const putUser = async (req, res) => {
  try {
    const id = req.params.id;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user id." });
    }

    if (Object.keys(req.body).length === 0) {
      return res.status(400).json({ message: "No data provided for update." });
    }

    // Prevent password updates through this endpoint
    if ("password" in req.body) {
      return res
        .status(400)
        .json({ message: "Use change-password endpoint to update password." });
    }

    const user = await User.findById(id);
    if (!user || user.deletedAt) {
      return res.status(404).json({ message: "User not found." });
    }

    // Track old roles for counter update
    const oldRoles = user.role
      ? Array.isArray(user.role)
        ? user.role
        : [user.role]
      : [];

    // Unique fields checks
    if (req.body.employeeId && req.body.employeeId !== user.employeeId) {
      const exists = await User.findOne({
        employeeId: req.body.employeeId,
        _id: { $ne: id },
      });
      if (exists)
        return res.status(400).json({ message: "employeeId already in use." });
      user.employeeId = req.body.employeeId;
    }

    if (req.body.username && req.body.username !== user.username) {
      const exists = await User.findOne({
        username: req.body.username.toLowerCase(),
        _id: { $ne: id },
      });
      if (exists)
        return res.status(400).json({ message: "username already in use." });
      user.username = req.body.username.toLowerCase();
    }

    if (req.body.email && req.body.email !== user.email) {
      const exists = await User.findOne({
        email: req.body.email.toLowerCase(),
        _id: { $ne: id },
      });
      if (exists)
        return res.status(400).json({ message: "email already in use." });
      user.email = req.body.email.toLowerCase();
    }

    // Handle role validation - only save if valid ObjectId(s)
    if ("role" in req.body) {
      const roleValue = req.body.role;

      if (roleValue === null || roleValue === undefined) {
        // Allow clearing roles
        user.role = [];
      } else if (Array.isArray(roleValue)) {
        // Validate all items in array are valid ObjectIds
        const validRoleIds = roleValue.filter((id) => {
          if (!id) return false;
          return mongoose.Types.ObjectId.isValid(id);
        });

        if (validRoleIds.length !== roleValue.length) {
          return res.status(400).json({
            message:
              "Invalid role ID(s). All role values must be valid ObjectIds.",
          });
        }

        // Verify roles exist in database
        const existingRoles = await Role.find({
          _id: { $in: validRoleIds },
          deletedAt: null,
        }).select("_id");

        const existingRoleIds = existingRoles.map((r) => String(r._id));
        const missingRoleIds = validRoleIds.filter(
          (id) => !existingRoleIds.includes(String(id)),
        );

        if (missingRoleIds.length > 0) {
          return res.status(400).json({
            message: `Role(s) not found: ${missingRoleIds.join(", ")}`,
          });
        }

        user.role = validRoleIds;
      } else {
        // Single value - validate it's a valid ObjectId
        if (!mongoose.Types.ObjectId.isValid(roleValue)) {
          return res.status(400).json({
            message: "Invalid role ID. Role must be a valid ObjectId.",
          });
        }

        // Verify role exists in database
        const existingRole = await Role.findOne({
          _id: roleValue,
          deletedAt: null,
        }).select("_id");

        if (!existingRole) {
          return res.status(400).json({
            message: "Role not found.",
          });
        }

        user.role = [roleValue];
      }
    }

    // Apply other allowed updatable fields
    const allowed = [
      "position",
      "firstName",
      "middleName",
      "lastName",
      "team",
      "isActive",
    ];
    allowed.forEach((f) => {
      if (f in req.body) user[f] = req.body[f];
    });

    // permissionsOverride can be updated directly
    if ("permissionsOverride" in req.body) {
      if (
        typeof req.body.permissionsOverride !== "object" ||
        Array.isArray(req.body.permissionsOverride)
      ) {
        return res
          .status(400)
          .json({ message: "permissionsOverride must be an object." });
      }
      user.permissionsOverride = req.body.permissionsOverride;
      user.markModified("permissionsOverride");
    }

    await user.save();

    // Log user update to audit trail
    const changedFields = Object.keys(req.body).filter(
      (key) => !["role", "team"].includes(key),
    );
    if (changedFields.length > 0 || "role" in req.body) {
      await postAuditTrailLog(
        "U",
        user._id,
        "USERS",
        `User updated: ${user.username}`,
        {
          id: req.user?._id || req.user?.id || user._id,
          name: req.user
            ? `${req.user.firstName} ${req.user.lastName}`
            : `${user.firstName} ${user.lastName}`,
        },
        JSON.stringify({
          changedFields,
          updatedValues: req.body,
        }),
      );
    }

    // Update role counters if roles were changed
    if ("role" in req.body) {
      const newRoles = user.role
        ? Array.isArray(user.role)
          ? user.role
          : [user.role]
        : [];

      // Convert to strings for proper comparison
      const oldRoleStrings = oldRoles.map((r) => r.toString());
      const newRoleStrings = newRoles.map((r) => r.toString());

      console.log("DEBUG putUser role update:");
      console.log("oldRoles:", oldRoles);
      console.log("oldRoleStrings:", oldRoleStrings);
      console.log("newRoles:", newRoles);
      console.log("newRoleStrings:", newRoleStrings);

      // Decrement counter for roles that were removed
      for (const oldRoleId of oldRoles) {
        const oldRoleString = oldRoleId.toString();
        if (!newRoleStrings.includes(oldRoleString)) {
          console.log(`Decrementing role ${oldRoleString}`);
          const result = await Role.updateOne(
            { _id: oldRoleId },
            { $inc: { Counter: -1 } },
          );
          console.log(`Decrement result:`, result);
        }
      }

      // Increment counter for roles that were added
      for (const newRoleId of newRoles) {
        const newRoleString = newRoleId.toString();
        if (!oldRoleStrings.includes(newRoleString)) {
          console.log(`Incrementing role ${newRoleString}`);
          const result = await Role.updateOne(
            { _id: newRoleId },
            { $inc: { Counter: 1 } },
          );
          console.log(`Increment result:`, result);
        }
      }
    }

    res.status(200).json({
      message: "User updated successfully.",
      user: {
        id: user._id,
        employeeId: user.employeeId,
        position: user.position,
        firstName: user.firstName,
        middleName: user.middleName,
        lastName: user.lastName,
        username: user.username,
        contactNumber: user.contactNumber,
        email: user.email,
        role: user.role,
        team: user.team,
        isActive: user.isActive,
        permissionsOverride: user.permissionsOverride,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error.", error: error.message });
  }
};

const changePassword = async (req, res) => {
  try {
    const id = req.params.id;
    const { currentPassword, newPassword, confirmPassword } = req.body ?? {};

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user id." });
    }

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        message:
          "currentPassword, newPassword and confirmPassword are required.",
      });
    }

    if (newPassword !== confirmPassword) {
      return res
        .status(400)
        .json({ message: "New password and confirm password do not match." });
    }

    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ message: "New password must be at least 6 characters." });
    }

    const user = await User.findById(id);
    if (!user || user.deletedAt) {
      return res.status(404).json({ message: "User not found." });
    }

    const valid = await user.validatePassword(currentPassword);
    if (!valid)
      return res
        .status(400)
        .json({ message: "Current password is incorrect." });

    user.password = newPassword;
    await user.save();

    // Log password change to audit trail
    await postAuditTrailLog(
      "U",
      user._id,
      "USERS",
      `Password changed for user: ${user.username}`,
      {
        id: id,
        name: `${user.firstName} ${user.lastName}`,
      },
      JSON.stringify({
        userId: user._id,
        username: user.username,
        action: "password_change",
      }),
    );

    res.status(200).json({ message: "Password changed successfully." });
  } catch (error) {
    res.status(500).json({ message: "Server error.", error: error.message });
  }
};

const resetPassword = async (req, res) => {
  try {
    const id = req.params.id;
    const {
      length = 12,
      uppercase = true,
      lowercase = true,
      numbers = true,
      symbols = true,
    } = req.body ?? {};

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user id." });
    }

    const user = await User.findById(id);
    if (!user || user.deletedAt) {
      return res.status(404).json({ message: "User not found." });
    }

    // Generate password using generateKey utility
    const newPassword = generateKey({
      length: parseInt(length, 10),
      uppercase,
      lowercase,
      numbers,
      symbols,
    });

    // Set password (pre-save hook will hash it)
    user.password = newPassword;
    await user.save();

    // Log password reset to audit trail
    await postAuditTrailLog(
      "U",
      user._id,
      "USERS",
      `Password reset for user: ${user.username}`,
      {
        id: req.user?._id || req.user?.id || id,
        name: req.user
          ? `${req.user.firstName} ${req.user.lastName}`
          : `${user.firstName} ${user.lastName}`,
      },
      JSON.stringify({
        userId: user._id,
        username: user.username,
        action: "password_reset",
        newPassword: newPassword,
      }),
    );

    res.status(200).json({
      message: "Password generated and updated successfully.",
      userId: user._id,
      username: user.username,
      email: user.email,
      password: newPassword,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error.", error: error.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    const id = req.params.id;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user id." });
    }

    const user = await User.findById(id);
    if (!user || user.deletedAt) {
      return res.status(404).json({ message: "User not found." });
    }

    // Get user roles before deletion
    const userRoles = user.role
      ? Array.isArray(user.role)
        ? user.role
        : [user.role]
      : [];

    // Only decrement counters if the user was active and not already deleted
    const shouldDecrement = Boolean(user.isActive) && user.deletedAt === null;

    user.deletedAt = new Date();
    await user.save();

    // Log user deletion to audit trail
    await postAuditTrailLog(
      "D",
      user._id,
      "USERS",
      `User deleted: ${user.username}`,
      {
        id: req.user?._id || req.user?.id || user._id,
        name: req.user
          ? `${req.user.firstName} ${req.user.lastName}`
          : `${user.firstName} ${user.lastName}`,
      },
      JSON.stringify({
        userId: user._id,
        username: user.username,
        email: user.email,
      }),
    );

    if (userRoles.length > 0) {
      // Normalize and de-duplicate role ids
      const uniqueRoleIds = Array.from(
        new Set(userRoles.map((r) => r?.toString()).filter(Boolean)),
      );

      for (const roleIdStr of uniqueRoleIds) {
        if (!mongoose.Types.ObjectId.isValid(roleIdStr)) {
          console.log(`Skip recount: invalid role id ${roleIdStr}`);
          continue;
        }
        const roleObjId = new mongoose.Types.ObjectId(roleIdStr);
        const idStr = roleObjId.toString();
        // Recompute accurate count: only active, non-deleted users assigned to this role
        const count = await User.countDocuments({
          isActive: true,
          deletedAt: null,
          $or: [
            { role: roleObjId },
            { role: idStr },
            { role: { $elemMatch: { $eq: roleObjId } } },
            { role: { $elemMatch: { $eq: idStr } } },
          ],
        });
        const result = await Role.updateOne(
          { _id: roleObjId },
          { Counter: count },
        );
        console.log(
          `Recount role ${roleObjId}: active count=${count}, matched=${result.matchedCount}, modified=${result.modifiedCount}`,
        );
      }
    }

    res.status(200).json({
      message: "User deleted (soft) successfully.",
      userId: user._id,
      deletedAt: user.deletedAt,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error.", error: error.message });
  }
};

const loginUser = async (req, res) => {
  try {
    await seedSystemAdministratorIfUsersEmpty();

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

    // Log user login to audit trail
    await postAuditTrailLog(
      "R",
      user._id,
      "USERS",
      `User login: ${user.username}`,
      {
        id: user._id,
        name: `${user.firstName} ${user.lastName}`,
      },
      JSON.stringify({
        username: user.username,
        email: user.email,
        loginAt: user.lastLoginAt,
      }),
    );

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
    let roleData = null;
    try {
      roleTitle = await resolveRoleTitles(user.role);
      // Get role data with id and title
      if (user.role) {
        if (Array.isArray(user.role)) {
          const roles = await Role.find({ _id: { $in: user.role } }).select(
            "_id title",
          );
          roleData = roles.map((r) => ({ roleId: r._id, title: r.title }));
        } else {
          const roleDoc = await Role.findById(user.role).select("_id title");
          if (roleDoc) {
            roleData = { roleId: roleDoc._id, title: roleDoc.title };
          }
        }
      }
    } catch (err) {
      console.error("Failed to resolve role title:", err);
    }

    // Get team data with teamId and name by finding teams where user is a member or leader
    let teamData = null;
    try {
      const teams = await Team.find({
        $or: [{ members: user._id }, { leaders: user._id }],
        deletedAt: null,
      }).select("_id name");

      if (teams.length > 0) {
        if (teams.length === 1) {
          teamData = { teamId: teams[0]._id, name: teams[0].name };
        } else {
          teamData = teams.map((t) => ({ teamId: t._id, name: t.name }));
        }
      }
    } catch (err) {
      console.error("Failed to resolve team data:", err);
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
        role: roleData,
        team: teamData,
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

    // Log user logout to audit trail
    await postAuditTrailLog(
      "R",
      user._id,
      "USERS",
      `User logout: ${user.username}`,
      {
        id: user._id,
        name: `${user.firstName} ${user.lastName}`,
      },
      JSON.stringify({
        username: user.username,
        email: user.email,
      }),
    );

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

export {
  registerUser,
  getAllUsers,
  getUser,
  putUser,
  changePassword,
  resetPassword,
  loginUser,
  logoutUser,
  deleteUser,
};
