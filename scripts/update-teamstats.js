import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config({ path: "./.env" });

const MONGO_URI = process.env.MONGODB_URI;

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("MongoDB Connected for TeamStat migration");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
};

const updateTeamStats = async () => {
  try {
    await connectDB();

    const db = mongoose.connection.db;
    const teamsCollection = db.collection("teams");
    const documentsCollection = db.collection("documents");
    const teamStatsCollection = db.collection("teamstats");

    // Drop the old userId index if it exists
    try {
      console.log("Checking for old userId index...");
      const indexes = await teamStatsCollection.indexes();
      const hasUserIdIndex = indexes.some((index) => index.name === "userId_1");

      if (hasUserIdIndex) {
        console.log("Dropping old userId_1 index...");
        await teamStatsCollection.dropIndex("userId_1");
        console.log("✓ Old index dropped successfully\n");
      } else {
        console.log("No userId_1 index found\n");
      }
    } catch (error) {
      console.log(
        "Note: Could not drop userId_1 index (may not exist):",
        error.message,
      );
    }

    // Get all teams
    const teams = await teamsCollection.find({ deletedAt: null }).toArray();

    console.log(`Found ${teams.length} teams`);

    if (teams.length === 0) {
      console.log("No teams found to process");
      await mongoose.connection.close();
      process.exit(0);
    }

    let createdCount = 0;
    let updatedCount = 0;
    let errorCount = 0;

    for (const team of teams) {
      try {
        const teamId = team._id;
        console.log(`\nProcessing team: ${team.name} (${teamId})`);

        // Find all documents that have this team in privacy.teams
        const documents = await documentsCollection
          .find({
            "privacy.teams": teamId,
            deletedAt: null,
          })
          .toArray();

        console.log(`  Found ${documents.length} documents for this team`);

        // Check if TeamStat already exists
        const existingTeamStat = await teamStatsCollection.findOne({ teamId });

        // Create files array from documents
        const filesArray = documents.map((doc) => doc._id.toString());

        if (existingTeamStat) {
          // Update existing TeamStat
          console.log(`  Updating existing TeamStat for team ${teamId}`);

          // Merge existing files with new files (remove duplicates)
          const existingFiles = Array.isArray(existingTeamStat.files)
            ? existingTeamStat.files
            : [];
          const mergedFiles = [...new Set([...existingFiles, ...filesArray])];

          await teamStatsCollection.updateOne(
            { _id: existingTeamStat._id },
            {
              $set: {
                files: mergedFiles,
                updatedAt: new Date(),
              },
            },
          );

          console.log(
            `  ✓ Updated TeamStat with ${mergedFiles.length} total documents`,
          );
          updatedCount++;
        } else {
          // Create new TeamStat
          console.log(`  Creating new TeamStat for team ${teamId}`);

          await teamStatsCollection.insertOne({
            teamId,
            files: filesArray,
            pending: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          });

          console.log(
            `  ✓ Created TeamStat with ${documents.length} documents`,
          );
          createdCount++;
        }
      } catch (error) {
        console.error(`  ✗ Error processing team ${team._id}:`, error.message);
        errorCount++;
      }
    }

    console.log("\n=== Migration Summary ===");
    console.log(`Teams processed: ${teams.length}`);
    console.log(`TeamStats created: ${createdCount}`);
    console.log(`TeamStats updated: ${updatedCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log("========================\n");

    // Verify results
    const totalTeamStats = await teamStatsCollection.countDocuments();
    console.log(`Total TeamStats in database: ${totalTeamStats}`);

    await mongoose.connection.close();
    console.log("\nMongoDB connection closed");
    process.exit(0);
  } catch (error) {
    console.error("Error during migration:", error);
    await mongoose.connection.close();
    process.exit(1);
  }
};

// Run the migration
updateTeamStats();
