import { Team } from "../teams/team.model.js";

const getFullName = (user) => {
  if (!user || typeof user !== "object") return null;
  const constructed = [user.firstName, user.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return user.fullname || user.fullName || user.name || constructed || null;
};

const formatUserField = (field) => {
  if (!field) return null;
  if (Array.isArray(field)) {
    const names = field.map(getFullName).filter(Boolean);
    return names.length ? names : [];
  }
  return getFullName(field);
};

const formatUserFieldAsObject = (field) => {
  if (!field) return null;
  if (Array.isArray(field)) {
    return field
      .map((user) => {
        if (!user || typeof user !== "object") return null;
        return {
          id: user._id || user.id,
          name: getFullName(user),
        };
      })
      .filter((item) => item && item.name);
  }
  if (typeof field === "object") {
    return {
      id: field._id || field.id,
      name: getFullName(field),
    };
  }
  return null;
};

const postTeam = async (req, res) => {
  try {
    const {
      name,
      members,
      createdBy: createdByBody,
      createdby,
      ...other
    } = req.body;
    const creator = createdByBody ?? createdby ?? req.user?.id ?? req.user?._id;

    if (!name) {
      return res.status(400).json({ message: "Team name is required" });
    }

    const existing = await Team.findOne({ name });
    if (existing) {
      return res.status(409).json({ message: "Team already exists" });
    }

    const teamData = { name, members, ...other };
    if (creator) teamData.createdBy = creator; // use schema field createdBy

    const newTeam = new Team(teamData);
    await newTeam.save();

    return res.status(201).json({ message: "Team created", team: newTeam });
  } catch (err) {
    console.error("Team registration error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

const getAllTeams = async (req, res) => {
  try {
    // pagination
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const maxLimit = 100;
    let limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
    if (limit > maxLimit) limit = maxLimit;

    // keyword search (name OR description)
    const keyword = (req.query.keyword ?? req.query.q ?? "").toString().trim();
    const filter = { deletedAt: null };
    if (keyword) {
      const re = new RegExp(keyword, "i");
      filter.$or = [{ name: re }, { description: re }];
    }

    const total = await Team.countDocuments(filter);
    const totalPages = Math.ceil(total / limit) || 1;

    const data = await Team.find(filter)
      .populate({
        path: "createdBy leaders members", // use createdBy (camelCase)
        select: "fullname fullName name firstName lastName",
      })
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    const transformed = data.map((d) => {
      const obj = d.toObject ? d.toObject() : { ...d };
      obj.createdBy = formatUserField(obj.createdBy);
      obj.leaders = formatUserFieldAsObject(obj.leaders) ?? [];
      obj.members = formatUserFieldAsObject(obj.members) ?? [];
      return obj;
    });

    res.status(200).json({
      data: transformed,
      meta: { total, page, limit, totalPages },
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error.",
      error: error.message,
    });
  }
};

const getTeam = async (req, res) => {
  try {
    const data = await Team.findById(req.params.id).populate({
      path: "createdBy leaders members",
      select: "firstName lastName fullname fullName name",
    });

    if (!data) {
      return res.status(404).json({ message: "Team not found." });
    }

    const obj = data.toObject ? data.toObject() : { ...data };
    obj.createdBy = formatUserField(obj.createdBy);
    obj.leaders = formatUserFieldAsObject(obj.leaders) ?? [];
    obj.members = formatUserFieldAsObject(obj.members) ?? [];

    res.status(200).json({ data: obj });
  } catch (error) {
    res.status(500).json({
      message: "Server error.",
      error: error.message,
    });
  }
};

const updateTeam = async (req, res) => {
  try {
    const id = req.params.id;
    const existingTeam = await Team.findById(id);
    if (!existingTeam) {
      return res.status(404).json({ message: "Team not found." });
    }

    const {
      name,
      description,
      leaders,
      members,
      createdBy: createdByBody,
      createdby,
      ...other
    } = req.body;

    // name validation & uniqueness
    if (name !== undefined) {
      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ message: "Team name is required" });
      }
      const conflict = await Team.findOne({
        name: name.trim(),
        _id: { $ne: id },
      });
      if (conflict) {
        return res.status(409).json({ message: "Team name already in use." });
      }
      existingTeam.name = name.trim();
    }

    if (description !== undefined) existingTeam.description = description;
    if (Array.isArray(leaders)) existingTeam.leaders = leaders;
    if (Array.isArray(members)) existingTeam.members = members;
    const creator = createdByBody ?? createdby;
    if (creator !== undefined) existingTeam.createdBy = creator;

    // apply any other provided fields
    for (const [k, v] of Object.entries(other)) existingTeam[k] = v;

    await existingTeam.save();

    // return populated & formatted team (same format as getTeam)
    const data = await Team.findById(id).populate({
      path: "createdBy leaders members",
      select: "firstName lastName fullname fullName name",
    });

    const obj = data.toObject ? data.toObject() : { ...data };
    obj.createdBy = formatUserField(obj.createdBy);
    obj.leaders = formatUserField(obj.leaders) ?? [];
    obj.members = formatUserField(obj.members) ?? [];

    return res.status(200).json({ message: "Team updated.", data: obj });
  } catch (error) {
    console.error("Update team error:", error);
    return res
      .status(500)
      .json({ message: "Server error.", error: error.message });
  }
};

const deleteTeam = async (req, res) => {
  try {
    const id = req.params.id;
    const team = await Team.findById(id);
    if (!team) {
      return res.status(404).json({ message: "Team not found." });
    }
    if (team.deletedAt) {
      return res.status(400).json({ message: "Team already deleted." });
    }

    team.deletedAt = new Date();
    await team.save();

    const data = await Team.findById(id).populate({
      path: "createdBy leaders members",
      select: "firstName lastName fullname fullName name",
    });

    const obj = data.toObject ? data.toObject() : { ...data };
    obj.createdBy = formatUserField(obj.createdBy);
    obj.leaders = formatUserField(obj.leaders) ?? [];
    obj.members = formatUserField(obj.members) ?? [];

    return res.status(200).json({ message: "Team deleted.", data: obj });
  } catch (error) {
    console.error("Delete team error:", error);
    return res
      .status(500)
      .json({ message: "Server error.", error: error.message });
  }
};

export { postTeam, getAllTeams, getTeam, updateTeam, deleteTeam };
