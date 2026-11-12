
const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const pool = require("./db");
const adminRoutes = require("./routes/adminRoutes");

const app = express();

// MIDDLEWARE
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// STATIC UPLOADS
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"))
);

// ROOT API
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "PostgreSQL Backend API is running",
  });
});

// DATABASE HEALTH
app.get("/api/health", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT NOW() AS current_time, current_database() AS database_name"
    );

    res.status(200).json({
      success: true,
      message: "Neon PostgreSQL connected successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Database Health Error:", error.message);

    res.status(500).json({
      success: false,
      message: "Database connection failed",
    });
  }
});

// ADMIN ROUTES
app.use("/api/admin", adminRoutes);

// 404 HANDLER
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `API route not found: ${req.method} ${req.originalUrl}`,
  });
});

// ERROR HANDLER
app.use((err, req, res, next) => {
  console.error("Server Error:", err);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

// START SERVER
const PORT = process.env.PORT || 5001;

const startServer = async () => {
  try {
    await pool.query("SELECT 1");

    console.log("Neon PostgreSQL connected successfully");

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
      console.log("Admin routes: /api/admin");
      console.log("Health check: /api/health");
    });
  } catch (error) {
    console.error("Database connection failed:", error.message);
    process.exit(1);
  }
};

startServer();
