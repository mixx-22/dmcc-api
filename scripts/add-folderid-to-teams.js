import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config({ path: "./.env" });

const MONGO_URI = process.env.MONGODB_URI;

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("MongoDB Connected for migration");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
};

const addFolderIdToTeams = async () => {
  try {
    await connectDB();

    const db = mongoose.connection.db;
    const teamsCollection = db.collection("teams");

    // Find all teams without folderId field
    const teamsWithoutFolderId = await teamsCollection
      .find({
        folderId: { $exists: false },
      })
      .toArray();

    console.log(
      `Found ${teamsWithoutFolderId.length} teams without folderId field`,
    );

    if (teamsWithoutFolderId.length === 0) {
      console.log(
        "No teams to migrate - all teams already have folderId field",
      );
      await mongoose.connection.close();
      process.exit(0);
    }

    // Update each team to add folderId field
    const result = await teamsCollection.updateMany(
      { folderId: { $exists: false } },
      { $set: { folderId: "" } },
    );

    console.log(`Successfully updated ${result.modifiedCount} teams`);
    console.log(`Matched ${result.matchedCount} teams`);

    // Verify the update
    const verifyTeams = await teamsCollection
      .find({
        folderId: { $exists: false },
      })
      .toArray();

    if (verifyTeams.length === 0) {
      console.log("✓ Migration successful - all teams now have folderId field");
    } else {
      console.log(
        `⚠ Warning: ${verifyTeams.length} teams still missing folderId field`,
      );
    }

    await mongoose.connection.close();
    console.log("Migration completed");
    process.exit(0);
  } catch (error) {
    console.error("Migration error:", error);
    await mongoose.connection.close();
    process.exit(1);
  }
};

// Run the migration
addFolderIdToTeams();
