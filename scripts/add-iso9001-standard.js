import mongoose from "mongoose";
import dotenv from "dotenv";
import { randomUUID } from "crypto";

dotenv.config({ path: "./.env" });

const MONGO_URI = process.env.MONGODB_URI;

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("MongoDB Connected for adding ISO/IEC 20000-1:2024 standard");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
};

const addISO20000Standard = async () => {
  try {
    await connectDB();

    const db = mongoose.connection.db;
    const standardsCollection = db.collection("standards");

    // Check if ISO/IEC 20000-1:2024 already exists
    const existingStandard = await standardsCollection.findOne({
      standard: "ISO/IEC 20000-1:2024",
      deletedAt: null,
    });

    if (existingStandard) {
      console.log(
        "ISO/IEC 20000-1:2024 standard already exists in the database.",
      );
      console.log(`Standard ID: ${existingStandard._id}`);
      process.exit(0);
    }

    const iso20000Data = {
      standard: "ISO/IEC 20000-1:2024",
      description: "IT Service Management System requirements.",
      clauses: [
        {
          id: randomUUID(),
          clause: "4",
          title: "Context of the Organization",
          subClauses: [
            {
              id: randomUUID(),
              clause: "4.1",
              description: "Context of the ITSMS.",
            },
            {
              id: randomUUID(),
              clause: "4.2",
              description: "Interested parties.",
            },
            {
              id: randomUUID(),
              clause: "4.3",
              description: "Scope of the ITSMS.",
            },
            {
              id: randomUUID(),
              clause: "4.4",
              description: "Service management system.",
            },
          ],
        },
        {
          id: randomUUID(),
          clause: "5",
          title: "Leadership",
          subClauses: [
            {
              id: randomUUID(),
              clause: "5.1",
              description: "Leadership and commitment.",
            },
            {
              id: randomUUID(),
              clause: "5.2",
              description: "Service management policy.",
            },
            {
              id: randomUUID(),
              clause: "5.3",
              description: "Roles and responsibilities.",
            },
          ],
        },
        {
          id: randomUUID(),
          clause: "6",
          title: "Planning",
          subClauses: [
            {
              id: randomUUID(),
              clause: "6.1",
              description: "Risks and opportunities.",
            },
            {
              id: randomUUID(),
              clause: "6.2",
              description: "Service management objectives.",
            },
          ],
        },
        {
          id: randomUUID(),
          clause: "7",
          title: "Support",
          subClauses: [
            {
              id: randomUUID(),
              clause: "7.1",
              description: "Resources.",
            },
            {
              id: randomUUID(),
              clause: "7.2",
              description: "Competence.",
            },
            {
              id: randomUUID(),
              clause: "7.3",
              description: "Awareness.",
            },
            {
              id: randomUUID(),
              clause: "7.4",
              description: "Communication.",
            },
            {
              id: randomUUID(),
              clause: "7.5",
              description: "Documented information.",
            },
          ],
        },
        {
          id: randomUUID(),
          clause: "8",
          title: "Operation",
          subClauses: [
            {
              id: randomUUID(),
              clause: "8.1",
              description: "Service portfolio management.",
            },
            {
              id: randomUUID(),
              clause: "8.2",
              description: "Service level management.",
            },
            {
              id: randomUUID(),
              clause: "8.3",
              description: "Incident and request management.",
            },
            {
              id: randomUUID(),
              clause: "8.4",
              description: "Change management.",
            },
            {
              id: randomUUID(),
              clause: "8.5",
              description: "Configuration management.",
            },
          ],
        },
        {
          id: randomUUID(),
          clause: "9",
          title: "Performance Evaluation",
          subClauses: [
            {
              id: randomUUID(),
              clause: "9.1",
              description: "Monitoring and measurement.",
            },
            {
              id: randomUUID(),
              clause: "9.2",
              description: "Internal audit.",
            },
            {
              id: randomUUID(),
              clause: "9.3",
              description: "Management review.",
            },
          ],
        },
        {
          id: randomUUID(),
          clause: "10",
          title: "Improvement",
          subClauses: [
            {
              id: randomUUID(),
              clause: "10.1",
              description: "Nonconformity and corrective action.",
            },
            {
              id: randomUUID(),
              clause: "10.2",
              description: "Continual improvement.",
            },
          ],
        },
      ],
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Insert the standard
    const result = await standardsCollection.insertOne(iso20000Data);

    console.log("✅ ISO/IEC 20000-1:2024 standard added successfully!");
    console.log(`Standard ID: ${result.insertedId}`);
    console.log(`Total clauses: ${iso20000Data.clauses.length}`);

    // Count total subclauses
    const totalSubClauses = iso20000Data.clauses.reduce(
      (sum, clause) => sum + clause.subClauses.length,
      0,
    );
    console.log(`Total subclauses: ${totalSubClauses}`);

    process.exit(0);
  } catch (error) {
    console.error("Error adding ISO/IEC 20000-1:2024 standard:", error);
    process.exit(1);
  }
};

// Run the script
addISO20000Standard();
