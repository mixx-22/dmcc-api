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

const addCheckedOutToFiles = async () => {
  try {
    await connectDB();

    const db = mongoose.connection.db;
    const documentsCollection = db.collection("documents");

    // Find all documents with type "file" that don't have checkedOut in metadata
    const fileDocuments = await documentsCollection
      .find({
        type: "file",
        $or: [
          { "metadata.checkedOut": { $exists: false } },
          { "metadata.checkedOut": null },
        ],
      })
      .toArray();

    console.log(
      `Found ${fileDocuments.length} file documents without checkedOut field`,
    );

    if (fileDocuments.length === 0) {
      console.log("No documents to update");
      await mongoose.connection.close();
      process.exit(0);
    }

    // Update each document
    let successCount = 0;
    let errorCount = 0;

    for (const doc of fileDocuments) {
      try {
        // Update metadata to include checkedOut: 0
        const updatedMetadata = {
          ...doc.metadata,
          checkedOut: 0,
        };

        await documentsCollection.updateOne(
          { _id: doc._id },
          { $set: { metadata: updatedMetadata } },
        );

        successCount++;
        console.log(
          `✓ Updated document: ${doc.title || doc._id} (${successCount}/${fileDocuments.length})`,
        );
      } catch (error) {
        errorCount++;
        console.error(`✗ Failed to update document ${doc._id}:`, error.message);
      }
    }

    console.log("\n=== Migration Summary ===");
    console.log(`Total documents found: ${fileDocuments.length}`);
    console.log(`Successfully updated: ${successCount}`);
    console.log(`Failed to update: ${errorCount}`);
    console.log("========================\n");

    await mongoose.connection.close();
    console.log("MongoDB connection closed");
    process.exit(0);
  } catch (error) {
    console.error("Migration error:", error);
    await mongoose.connection.close();
    process.exit(1);
  }
};

// Run the migration
addCheckedOutToFiles();
