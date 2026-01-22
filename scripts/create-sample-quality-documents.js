import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config({ path: "./.env" });

const MONGO_URI = process.env.MONGODB_URI;

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("MongoDB Connected for creating sample documents");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
};

const createSampleQualityDocuments = async () => {
  try {
    await connectDB();

    const db = mongoose.connection.db;
    const documentsCollection = db.collection("documents");
    const usersCollection = db.collection("users");
    const fileTypesCollection = db.collection("filetypes");

    // Get first user as owner
    const user = await usersCollection.findOne({});
    if (!user) {
      console.log("No user found. Please create a user first.");
      process.exit(1);
    }

    console.log(`Using user: ${user.firstName} ${user.lastName} (${user._id})`);

    // Get default FileType
    const defaultFileType = await fileTypesCollection.findOne({
      isDefault: true,
      deletedAt: null,
    });

    if (!defaultFileType) {
      console.log(
        "No default FileType found. Creating documents without fileType.",
      );
    } else {
      console.log(
        `Using FileType: ${defaultFileType.FileType} (${defaultFileType._id})`,
      );
    }

    // Sample quality documents to create
    const sampleDocuments = [
      {
        title: "Quality Manual - ISO 9001",
        description:
          "Company quality management system manual compliant with ISO 9001:2015 standards",
        type: "file",
        status: 0,
        owner: user._id,
        parentId: null,
        path: [],
        privacy: { users: [], teams: [], roles: [] },
        permissionOverrides: { readOnly: 1, restricted: 1 },
        metadata: {
          isQualityDocument: true,
          fileType: defaultFileType ? defaultFileType._id : null,
          checkedOut: 1,
          filename: "quality-manual-iso9001.pdf",
          size: 2048000,
          mimeType: "application/pdf",
        },
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        title: "Standard Operating Procedure - Document Control",
        description: "SOP for document control and management procedures",
        type: "file",
        status: 0,
        owner: user._id,
        parentId: null,
        path: [],
        privacy: { users: [], teams: [], roles: [] },
        permissionOverrides: { readOnly: 1, restricted: 1 },
        metadata: {
          isQualityDocument: true,
          fileType: defaultFileType ? defaultFileType._id : null,
          checkedOut: 1,
          filename: "sop-document-control.pdf",
          size: 1536000,
          mimeType: "application/pdf",
        },
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        title: "Work Instruction - Equipment Calibration",
        description:
          "Detailed work instruction for calibrating laboratory equipment",
        type: "file",
        status: 0,
        owner: user._id,
        parentId: null,
        path: [],
        privacy: { users: [], teams: [], roles: [] },
        permissionOverrides: { readOnly: 1, restricted: 1 },
        metadata: {
          isQualityDocument: true,
          fileType: defaultFileType ? defaultFileType._id : null,
          checkedOut: 1,
          filename: "wi-equipment-calibration.docx",
          size: 512000,
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        },
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        title: "Quality Policy Statement 2026",
        description: "Official quality policy statement for the organization",
        type: "file",
        status: 0,
        owner: user._id,
        parentId: null,
        path: [],
        privacy: { users: [], teams: [], roles: [] },
        permissionOverrides: { readOnly: 1, restricted: 1 },
        metadata: {
          isQualityDocument: true,
          fileType: defaultFileType ? defaultFileType._id : null,
          checkedOut: 1,
          filename: "quality-policy-2026.pdf",
          size: 256000,
          mimeType: "application/pdf",
        },
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        title: "Training Record Template",
        description:
          "Template for recording employee training and competency assessments",
        type: "file",
        status: 0,
        owner: user._id,
        parentId: null,
        path: [],
        privacy: { users: [], teams: [], roles: [] },
        permissionOverrides: { readOnly: 1, restricted: 1 },
        metadata: {
          isQualityDocument: true,
          fileType: defaultFileType ? defaultFileType._id : null,
          checkedOut: 1,
          filename: "training-record-template.xlsx",
          size: 128000,
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    console.log(
      `\nCreating ${sampleDocuments.length} sample quality documents...\n`,
    );

    let successCount = 0;
    let errorCount = 0;

    for (const doc of sampleDocuments) {
      try {
        const result = await documentsCollection.insertOne(doc);
        successCount++;
        console.log(`✓ Created: ${doc.title} (ID: ${result.insertedId})`);
      } catch (error) {
        errorCount++;
        console.error(`✗ Failed to create: ${doc.title}`, error.message);
      }
    }

    console.log("\n=== Creation Complete ===");
    console.log(`Successfully created: ${successCount}`);
    console.log(`Failed: ${errorCount}`);

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("Script error:", error);
    await mongoose.connection.close();
    process.exit(1);
  }
};

// Run the script
createSampleQualityDocuments();
