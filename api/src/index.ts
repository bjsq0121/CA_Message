import "dotenv/config";
import express from "express";
import cors from "cors";
import { authRoutes } from "./routes/auth.js";
import { roomRoutes } from "./routes/rooms.js";
import { messageRoutes } from "./routes/messages.js";
import { userRoutes } from "./routes/users.js";
import { fileRoutes } from "./routes/files.js";
import { initSqlite, closeSqlite } from "./db/sqlite.js";

const app = express();
const PORT = Number(process.env.PORT ?? 3200);

const corsOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:4830")
  .split(",")
  .map((s) => s.trim());

app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "ca-messenger-api" });
});

// Routes
app.use("/auth", authRoutes);
app.use("/rooms", roomRoutes);
app.use("/messages", messageRoutes);
app.use("/users", userRoutes);
app.use("/files", fileRoutes);

function start() {
  initSqlite();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[messenger-api] running on http://localhost:${PORT}`);
  });
}

process.on("SIGTERM", () => {
  closeSqlite();
  process.exit(0);
});

start();
