import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { setIo } from "./notification.service.js";

/**
 * Initialise Socket.io on top of the existing HTTP server.
 * Each authenticated user auto-joins a personal room `user:<id>`
 * so notifications can be emitted directly to them.
 */
export const initWebSocket = (httpServer, allowedOrigins) => {
  const io = new Server(httpServer, {
    cors: {
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (allowedOrigins.includes(origin)) return cb(null, true);
        if (
          process.env.NODE_ENV !== "production" &&
          origin?.startsWith("http://localhost")
        ) {
          return cb(null, true);
        }
        return cb(null, false);
      },
      credentials: true,
    },
  });

  // JWT authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error("Authentication required"));

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.userId;
    console.log(`[WS] User connected: ${userId}`);

    // Join personal room for targeted notifications
    socket.join(`user:${userId}`);

    socket.on("disconnect", () => {
      console.log(`[WS] User disconnected: ${userId}`);
    });
  });

  // Share the io instance with the notification service
  setIo(io);

  console.log("[WS] WebSocket server initialized");
  return io;
};
