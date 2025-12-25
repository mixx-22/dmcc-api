import express from "express";

const app = express(); // Create an Express application instance

// Middleware to parse JSON request bodies
app.use(express.json());

import userRouter from "./users/user.route.js";
import roleRoutes from "./roles/role.route.js";

app.use("/users", userRouter);
// route: http://localhost:4000/users

app.use("/roles", roleRoutes);
// route: http://localhost:4000/roles
// route: http://localhost:4000/roles/:id

export default app;
