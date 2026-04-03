import Standard from "./standard.model.js";

const postStandard = async (req, res) => {
  try {
    const { standard, description, clauses } = req.body;

    if (!standard) {
      return res.status(400).json({ message: "Standard is required." });
    }

    const standardData = {
      standard,
      description: description || "",
      clauses: clauses || [],
    };

    const newStandard = await Standard.create(standardData);

    return res.status(201).json({
      success: true,
      message: "Standard created successfully.",
      standard: newStandard,
    });
  } catch (error) {
    console.error("Error in postStandard:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create standard",
      error: error.message,
    });
  }
};

const getAllStandard = async (req, res) => {
  try {
    // pagination
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const maxLimit = 100;
    let limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
    if (limit > maxLimit) limit = maxLimit;

    const filter = { deletedAt: null };

    const total = await Standard.countDocuments(filter);
    const totalPages = Math.ceil(total / limit) || 1;

    const data = await Standard.find(filter)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: "Standards retrieved successfully",
      data,
      meta: { total, page, limit, totalPages },
    });
  } catch (error) {
    console.error("Error in getAllStandard:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve standards",
      error: error.message,
    });
  }
};

const getStandard = async (req, res) => {
  try {
    const standard = await Standard.findById(req.params.id);

    if (!standard || standard.deletedAt) {
      return res.status(404).json({ message: "Standard not found." });
    }

    return res.status(200).json({
      success: true,
      message: "Standard retrieved successfully",
      data: standard,
    });
  } catch (error) {
    console.error("Error in getStandard:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve standard",
      error: error.message,
    });
  }
};

const putStandard = async (req, res) => {
  try {
    if (Object.keys(req.body).length === 0) {
      return res.status(400).json({ message: "No data provided for update." });
    }

    const standard = await Standard.findById(req.params.id);
    if (!standard || standard.deletedAt) {
      return res.status(404).json({ message: "Standard not found." });
    }

    const { standard: standardName, description, clauses } = req.body;

    if (standardName !== undefined) standard.standard = standardName;
    if (description !== undefined) standard.description = description;
    if (clauses !== undefined) {
      standard.clauses = clauses;
      standard.markModified("clauses");
    }

    const saved = await standard.save();

    return res.status(200).json({
      success: true,
      message: "Standard updated successfully.",
      standard: saved,
    });
  } catch (error) {
    console.error("Error in putStandard:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update standard",
      error: error.message,
    });
  }
};

const deleteStandard = async (req, res) => {
  try {
    const standard = await Standard.findById(req.params.id);

    if (!standard || standard.deletedAt) {
      return res.status(404).json({ message: "Standard not found." });
    }

    standard.deletedAt = new Date();
    await standard.save();

    return res.status(200).json({
      success: true,
      message: "Standard deleted successfully.",
      standard,
    });
  } catch (error) {
    console.error("Error in deleteStandard:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete standard",
      error: error.message,
    });
  }
};

export {
  postStandard,
  getAllStandard,
  getStandard,
  putStandard,
  deleteStandard,
};
