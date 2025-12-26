import express from "express";
import cors from "cors";

const app = express();

app.use(express.json());

const defaultOrigins = [
  "http://localhost:3000",
  "http://localhost:4000",
  "http://192.168.1.14:4000",
];
const allowedOrigins = (process.env.CLIENT_ORIGIN || defaultOrigins.join(","))
  .split(",")
  .map((s) => s.trim());

const corsOptions = {
  origin: (origin, cb) => {
    console.log("CORS check origin:", origin, "allowed:", allowedOrigins);
    // allow non-browser tools (no origin)
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    // in development allow any localhost variant to avoid accidental 500s
    if (
      process.env.NODE_ENV !== "production" &&
      origin.startsWith("http://localhost")
    ) {
      console.warn("Allowing localhost origin in dev:", origin);
      return cb(null, true);
    }
    // do not throw — return false so cors middleware denies it without causing 500
    return cb(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    return cors(corsOptions)(req, res, (err) => {
      if (err) {
        console.warn("CORS preflight denied:", err.message || err);
        return res.status(403).send("CORS preflight denied");
      }
      next();
    });
  }
  next();
});

import userRouter from "./users/user.route.js";
import roleRoutes from "./roles/role.route.js";

app.use("/users", userRouter);
app.use("/roles", roleRoutes);

export default app;
