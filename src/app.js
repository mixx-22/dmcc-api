import express from "express";

const app = express(); // Create an Express application instance

// Middleware to parse JSON request bodies
app.use(express.json());

import userRouter from "./users/user.route.js";
import roleRoutes from "./roles/role.route.js";

app.use("/api/users", userRouter);
// route: http://localhost:4000/api/users/register

app.use("/api/roles", roleRoutes);
// route: http://localhost:4000/api/roles/register-role

export default app;
