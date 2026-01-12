#!/usr/bin/env node
import dotenv from "dotenv";
dotenv.config();
import connectDB from "../src/config/database.js";
import { User } from "../src/users/user.model.js";
import { Role } from "../src/roles/role.model.js";
import mongoose from "mongoose";

const updateRoleCounts = async () => {
  try {
    console.log("Connecting to database...");
    await connectDB();

    console.log("Fetching all roles...");
    const roles = await Role.find({ deletedAt: null }).select("_id title");

    if (roles.length === 0) {
      console.log("No roles found.");
      await mongoose.connection.close();
      process.exit(0);
    }

    console.log(`Found ${roles.length} role(s). Updating counters...\n`);

    let totalUpdates = 0;

    for (const role of roles) {
      // Count only active, non-deleted users assigned to this role
      // Handle both ObjectId and string storage, and both array/scalar forms
      const idObj = role._id;
      const idStr = role._id.toString();
      const count = await User.countDocuments({
        isActive: true,
        deletedAt: null,
        $or: [
          { role: idObj },
          { role: idStr },
          { role: { $elemMatch: { $eq: idObj } } },
          { role: { $elemMatch: { $eq: idStr } } },
        ],
      });

      // Update the role's Counter field
      const result = await Role.updateOne(
        { _id: role._id },
        { Counter: count }
      );

      if (result.modifiedCount > 0 || result.matchedCount > 0) {
        console.log(`✓ Role "${role.title}": Counter updated to ${count}`);
        totalUpdates++;
      }
    }

    console.log(`\n✓ Successfully updated ${totalUpdates} role counter(s).`);
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("Error updating role counts:", error.message);
    await mongoose.connection.close();
    process.exit(1);
  }
};

updateRoleCounts();
