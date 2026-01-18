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

const migrateOwnerField = async () => {
  try {
    await connectDB();

    const db = mongoose.connection.db;
    const documentsCollection = db.collection("documents");

    // Find all documents with old owner structure
    const oldDocuments = await documentsCollection
      .find({
        "owner.id": { $exists: true },
      })
      .toArray();

    console.log(
      `Found ${oldDocuments.length} documents with old owner structure`,
    );

    if (oldDocuments.length === 0) {
      console.log("No documents to migrate");
      process.exit(0);
    }

    // Update each document
    let successCount = 0;
    let errorCount = 0;

    for (const doc of oldDocuments) {
      try {
        // Extract the owner ID from the old structure
        const ownerId = doc.owner.id;

        // Update the document with the new owner structure
        await documentsCollection.updateOne(
          { _id: doc._id },
          {
            $set: {
              owner: ownerId,
            },
          },
        );

        successCount++;
        console.log(`✓ Migrated document: ${doc._id} (${doc.title})`);
      } catch (error) {
        errorCount++;
        console.error(
          `✗ Failed to migrate document: ${doc._id}`,
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

migrateOwnerField();
