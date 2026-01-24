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

const migrateFileTypeField = async () => {
  try {
    await connectDB();

    const db = mongoose.connection.db;
    const fileTypesCollection = db.collection("filetypes");

    // Find all documents with old "FileType" or "fileType" field
    const oldFileTypes = await fileTypesCollection
      .find({
        $or: [{ FileType: { $exists: true } }, { fileType: { $exists: true } }],
      })
      .toArray();

    console.log(
      `Found ${oldFileTypes.length} file types with old field structure`,
    );

    if (oldFileTypes.length === 0) {
      console.log("No file types to migrate");
      process.exit(0);
    }

    // Update each file type
    let successCount = 0;
    let errorCount = 0;

    for (const fileType of oldFileTypes) {
      try {
        // Get the value from either FileType or fileType field
        const fileTypeName = fileType.FileType || fileType.fileType;

        if (!fileTypeName) {
          console.log(
            `⚠ Skipping file type ${fileType._id}: no FileType/fileType value found`,
          );
          continue;
        }

        // Update the document with the new field name
        const updateResult = await fileTypesCollection.updateOne(
          { _id: fileType._id },
          {
            $set: {
              name: fileTypeName,
            },
            $unset: {
              FileType: "",
              fileType: "",
            },
          },
        );

        if (updateResult.modifiedCount > 0) {
          successCount++;
          console.log(
            `✓ Migrated file type: ${fileType._id} (${fileTypeName})`,
          );
        }
      } catch (error) {
        errorCount++;
        console.error(
          `✗ Failed to migrate file type: ${fileType._id}`,
          error.message,
        );
      }
    }

    console.log("\n=== Migration Complete ===");
    console.log(`Successfully migrated: ${successCount}`);
    console.log(`Failed: ${errorCount}`);

    process.exit(0);
  } catch (error) {
    console.error("Migration error:", error);
    process.exit(1);
  }
};

migrateFileTypeField();
