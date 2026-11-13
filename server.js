
const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const pool = require("./db");
const adminRoutes = require("./routes/adminRoutes");

const app = express();

// ===============================
// MIDDLEWARE
// ===============================

app.use(
  cors({
    origin: "*", // Development: allow web and Android app
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// ===============================
// STATIC IMAGE UPLOADS
// ===============================

app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"))
);

// ===============================
// HEALTH CHECK API
// ===============================

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "PostgreSQL Backend API is running",
  });
});

// ===============================
// DATABASE CHECK API
// ===============================

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.status(200).json({
      success: true,
      message: "Database connected successfully",
    });
  } catch (error) {
    console.error("Database Health Error:", error);

    res.status(500).json({
      success: false,
      message: "Database connection failed",
    });
  }
});

// ===============================
// ADMIN ROUTES
// ===============================

app.use("/api/admin", adminRoutes);

// ===============================
// 404 HANDLER
// ===============================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `API route not found: ${req.method} ${req.originalUrl}`,
  });
});

// ===============================
// GLOBAL ERROR HANDLER
// ===============================

app.use((err, req, res, next) => {
  console.error("Server Error:", err);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

// ===============================
// START SERVER
// ===============================

const PORT = process.env.PORT || 5001;

const startServer = async () => {
  try {
    await pool.query("SELECT 1");

    console.log("PostgreSQL connected successfully");

    app.listen(PORT, "0.0.0.0", () => {
      console.log("----------------------------------");
      console.log("BACKEND SERVER STARTED");
      console.log(`Local: http://localhost:${PORT}`);
      console.log(`Network: http://192.168.1.8:${PORT}`);
      console.log(`Gallery: http://192.168.1.8:${PORT}/api/admin/gallery`);
      console.log("----------------------------------");
    });

  } catch (error) {
    console.error(
      "PostgreSQL connection failed:",
      error.message
    );

    process.exit(1);
  }
};

startServer();
 
