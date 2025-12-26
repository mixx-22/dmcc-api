import dotenv from "dotenv";
import connectDB from "./config/database.js";
import app from "./app.js";

dotenv.config({
  path: "./.env",
});

if (!process.env.JWT_SECRET) {
  console.error("Missing required env: JWT_SECRET");
  process.exit(1);
}

const startServer = async () => {
  try {
    await connectDB();

    app.on("error", (err) => {
      console.log("Server error:", err);
      throw err;
    });

    app.listen(process.env.PORT || 8000, () => {
      console.log(`Server is running on port ${process.env.PORT || 8000}`);
    });
  } catch (error) {
    console.log("Failed to start server:", error);
  }
};

startServer();
