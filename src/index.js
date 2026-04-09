import dotenv from "dotenv";
import { createServer } from "http";
import connectDB from "./config/database.js";
import app from "./app.js";
import { initWebSocket } from "./notifications/websocket.js";

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

    const server = createServer(app);

    // Attach WebSocket server to the same HTTP server
    initWebSocket(server);

    server.on("error", (err) => {
      console.log("Server error:", err);
      throw err;
    });

    const PORT = process.env.PORT || 8000;
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`Server is running on 0.0.0.0:${PORT} (accessible from network)`);
    });
  } catch (error) {
    console.log("Failed to start server:", error);
  }
};

startServer();
