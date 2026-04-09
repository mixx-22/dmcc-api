import dotenv from "dotenv";
import { createServer } from "http";
import connectDB from "./config/database.js";
import app, { allowedOrigins } from "./app.js";
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

    const httpServer = createServer(app);

    // Attach Socket.io to the HTTP server
    initWebSocket(httpServer, allowedOrigins);

    httpServer.on("error", (err) => {
      console.log("Server error:", err);
      throw err;
    });

    const PORT = process.env.PORT || 8000;
    httpServer.listen(PORT, "0.0.0.0", () => {
      console.log(
        `Server is running on 0.0.0.0:${PORT} (accessible from network)`,
      );
    });
  } catch (error) {
    console.log("Failed to start server:", error);
  }
};

startServer();
