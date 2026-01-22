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

const addFileTypeToDocuments = async () => {
  try {
    await connectDB();

    const db = mongoose.connection.db;
    const documentsCollection = db.collection("documents");
    const fileTypesCollection = db.collection("filetypes");

    // Find the default FileType
    const defaultFileType = await fileTypesCollection.findOne({
      isDefault: true,
      deletedAt: null,
    });

    if (!defaultFileType) {
      console.log(
        "No default FileType found. Please create one first with isDefault: true",
      );
      process.exit(1);
    }

    console.log(
      `Default FileType found: ${defaultFileType.FileType} (ID: ${defaultFileType._id})`,
    );

    // Find all documents where type = "file" and fileType is not set in metadata
    const fileDocuments = await documentsCollection
      .find({
        type: "file",
        deletedAt: null,
        $or: [
          { "metadata.fileType": { $exists: false } },
          { "metadata.fileType": null },
          { "metadata.fileType": "" },
        ],
      })
      .toArray();

    console.log(
      `Found ${fileDocuments.length} file documents without fileType`,
    );

    if (fileDocuments.length === 0) {
      console.log("No documents to migrate");
      await mongoose.connection.close();
      process.exit(0);
    }

    // Update each document
    let successCount = 0;
    let errorCount = 0;

    for (const doc of fileDocuments) {
      try {
        // Update the document to add fileType in metadata
        await documentsCollection.updateOne(
          { _id: doc._id },
          {
            $set: {
              "metadata.fileType": defaultFileType._id,
            },
          },
        );

        successCount++;
        console.log(
          `✓ Updated document: ${doc.title || doc._id} (${successCount}/${fileDocuments.length})`,
        );
      } catch (error) {
        errorCount++;
        console.error(`✗ Error updating document ${doc._id}:`, error.message);
      }
    }

    console.log("\n=== Migration Complete ===");
    console.log(`Successfully updated: ${successCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Total processed: ${fileDocuments.length}`);

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("Migration error:", error);
    await mongoose.connection.close();
    process.exit(1);
  }
};

// Run the migration
addFileTypeToDocuments();
