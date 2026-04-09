import { WebSocketServer } from "ws";
import jwt from "jsonwebtoken";
import { URL } from "url";

/**
 * Map of userId (string) → Set<WebSocket>
 * A user may have multiple tabs / devices connected simultaneously.
 */
const clients = new Map();

/**
 * Send a JSON payload to every active WebSocket connection for a given user.
 *
 * @param {string} userId
 * @param {object} payload – must be JSON-serialisable
 */
const sendToUser = (userId, payload) => {
  const sockets = clients.get(userId);
  if (!sockets) return;
  const data = JSON.stringify(payload);
  for (const ws of sockets) {
    if (ws.readyState === ws.OPEN) {
      ws.send(data);
    }
  }
};

/**
 * Send a JSON payload to every user whose ID is in the provided array.
 *
 * @param {string[]} userIds
 * @param {object} payload
 */
const sendToUsers = (userIds, payload) => {
  for (const uid of userIds) {
    sendToUser(uid.toString(), payload);
  }
};

/**
 * Initialise the WebSocket server and attach it to an existing HTTP server.
 *
 * The client must connect with:
 *   ws://host:port/ws?token=<JWT>
 *
 * The server authenticates via the same JWT_SECRET used by the REST API.
 *
 * @param {import("http").Server} server – the Node HTTP server instance
 */
const initWebSocket = (server) => {
  const wss = new WebSocketServer({ noServer: true });

  // Handle the HTTP upgrade manually so we can authenticate first.
  server.on("upgrade", (request, socket, head) => {
    try {
      const parsedUrl = new URL(request.url, `http://${request.headers.host}`);

      // Only accept upgrades on /ws path
      if (parsedUrl.pathname !== "/ws") {
        socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
        socket.destroy();
        return;
      }

      const token = parsedUrl.searchParams.get("token");

      if (!token) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      let decoded;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
      } catch {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      // Attach userId so the 'connection' handler can use it.
      request.userId = decoded.id;

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } catch {
      socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
      socket.destroy();
    }
  });

  wss.on("connection", (ws, request) => {
    const userId = request.userId;
    if (!userId) {
      ws.close(1008, "Missing userId");
      return;
    }

    const uid = userId.toString();

    if (!clients.has(uid)) {
      clients.set(uid, new Set());
    }
    clients.get(uid).add(ws);

    console.log(`[ws] User ${uid} connected (${clients.get(uid).size} socket(s))`);

    // Keep-alive ping every 30 seconds
    const interval = setInterval(() => {
      if (ws.readyState === ws.OPEN) ws.ping();
    }, 30_000);

    ws.on("close", () => {
      clearInterval(interval);
      const set = clients.get(uid);
      if (set) {
        set.delete(ws);
        if (set.size === 0) clients.delete(uid);
      }
      console.log(`[ws] User ${uid} disconnected`);
    });

    ws.on("error", (err) => {
      console.error(`[ws] Error for user ${uid}:`, err.message);
    });

    // Acknowledge successful connection
    ws.send(JSON.stringify({ type: "CONNECTED", message: "WebSocket connected" }));
  });

  console.log("[ws] WebSocket server initialised on /ws");

  return wss;
};

export { initWebSocket, sendToUser, sendToUsers, clients };
