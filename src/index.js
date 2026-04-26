import dotenv from "dotenv";
import { createServer } from "http";
import net from "net";
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

const findAvailablePort = (startPort, maxAttempts) => {
  const tryPort = (port, attemptsLeft) =>
    new Promise((resolve, reject) => {
      const probe = net.createServer();

      probe.once("error", (err) => {
        probe.close();
        if (err?.code === "EADDRINUSE" && attemptsLeft > 0) {
          resolve(tryPort(port + 1, attemptsLeft - 1));
          return;
        }
        reject(err);
      });

      probe.once("listening", () => {
        probe.close(() => resolve(port));
      });

      probe.listen(port, "0.0.0.0");
    });

  return tryPort(startPort, maxAttempts);
};

const startServer = async () => {
  try {
    await connectDB();

    const httpServer = createServer(app);

    // Attach Socket.io to the HTTP server
    initWebSocket(httpServer, allowedOrigins);

    const requestedPort = Number(process.env.PORT) || 8000;
    const maxPortAttempts = Number(process.env.PORT_RETRY_ATTEMPTS) || 5;
    const resolvedPort = await findAvailablePort(requestedPort, maxPortAttempts);

    if (resolvedPort !== requestedPort) {
      console.warn(
        `Port ${requestedPort} is in use, starting server on ${resolvedPort}`,
      );
    }

    httpServer.listen(resolvedPort, "0.0.0.0", () => {
      console.log(
        `Server is running on 0.0.0.0:${resolvedPort} (accessible from network)`,
      );
    });

    httpServer.on("error", (err) => {
      console.log("Server error:", err);
      process.exit(1);
    });
  } catch (error) {
    console.log("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
