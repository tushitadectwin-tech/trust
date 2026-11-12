
// const express = require("express");
// const cors = require("cors");
// const path = require("path");
// require("dotenv").config();

// const pool = require("./db");
 const adminRoutes = require("./routes/adminRoutes");

 //const app = express();

// // MIDDLEWARE
// app.use(cors({
//   origin: "*",
//   methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
//   allowedHeaders: ["Content-Type", "Authorization"],
// }));

// app.use(express.json({ limit: "20mb" }));
// app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// // STATIC UPLOADS
// app.use(
//   "/uploads",
//   express.static(path.join(__dirname, "uploads"))
// );

// // ROOT API
// app.get("/", (req, res) => {
//   res.status(200).json({
//     success: true,
//     message: "PostgreSQL Backend API is running",
//   });
// });




const express = require("express");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const router = express.Router();
const pool = require("./db");
const upload = require("./middleware/uploads");
const teamUpload = require("./middleware/teamUpload");
const uploadDir = path.join(__dirname, "./uploads/services");
const galleryUpload = require("./middleware/galleryUpload");
const handleDonationUpload = require("./middleware/donationUpload");


 const app = express();

// MIDDLEWARE
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// Ensure upload folder exists
fs.mkdirSync(uploadDir, { recursive: true });
const jobApplicationUploadDir = path.join(
  __dirname,
  "./uploads/private/job-applications"
);

fs.mkdirSync(jobApplicationUploadDir, { recursive: true });


const jobApplicationStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, jobApplicationUploadDir);
  },

  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();

    cb(null, `${crypto.randomUUID()}${extension}`);
  },
});


const allowedJobApplicationFiles = {
  aadhar: {
    "application/pdf": [".pdf"],
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
  },

  resume: {
    "application/pdf": [".pdf"],
    "application/msword": [".doc"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
      ".docx",
    ],
  },
};

const jobApplicationFileFilter = (req, file, cb) => {
  const allowedTypes = allowedJobApplicationFiles[file.fieldname];

  if (!allowedTypes) {
    return cb(new Error("Invalid document field."));
  }

  const extension = path.extname(file.originalname).toLowerCase();
  const allowedExtensions = allowedTypes[file.mimetype];

  if (!allowedExtensions || !allowedExtensions.includes(extension)) {
    return cb(
      new Error(
        file.fieldname === "aadhar"
          ? "Aadhar must be PDF, JPG or PNG."
          : "Resume must be PDF, DOC or DOCX."
      )
    );
  }

  cb(null, true);
};


const jobApplicationUpload = multer({
  storage: jobApplicationStorage,
  fileFilter: jobApplicationFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 2,
  },
});


const removeJobApplicationFiles = (files = {}) => {
  Object.values(files)
    .flat()
    .forEach((file) => {
      if (file?.path && fs.existsSync(file.path)) {
        fs.unlink(file.path, (error) => {
          if (error) {
            console.error("Document cleanup error:", error.message);
          }
        });
      }
    });
};


const handleApplicationUpload = (req, res, next) => {
  jobApplicationUpload.fields([
    { name: "aadhar", maxCount: 1 },
    { name: "resume", maxCount: 1 },
  ])(req, res, (error) => {
    if (error) {
      removeJobApplicationFiles(req.files);

      return res.status(400).json({
        success: false,
        message: error.message || "Document upload failed.",
      });
    }

    next();
  });
};

function parsePoints(value) {
  if (value === undefined || value === null || value === "") {
    return [];
  }

  const points = typeof value === "string"
    ? JSON.parse(value)
    : value;

  if (
    !Array.isArray(points) ||
    !points.every((point) => typeof point === "string")
  ) {
    throw new Error("Points must be an array of strings");
  }

  return points;
}


function validateService(body) {
  const { title, category, description, status = "Active" } = body;

  if (
    typeof title !== "string" ||
    !title.trim() ||
    typeof category !== "string" ||
    !category.trim() ||
    typeof description !== "string" ||
    !description.trim()
  ) {
    return "Title, category and description are required.";
  }

  if (!["Active", "Inactive"].includes(status)) {
    return "Status must be Active or Inactive.";
  }

  return null;
}


function removeUploadedImage(imagePath) {
  if (
    !imagePath ||
    !imagePath.startsWith("/uploads/services/")
  ) {
    return;
  }

  const filename = path.basename(imagePath);
  const filePath = path.join(uploadDir, filename);

  fs.unlink(filePath, (error) => {
    if (error && error.code !== "ENOENT") {
      console.error("Image deletion error:", error.message);
    }
  });
}

function handleUpload(req, res, next) {
  upload.single("image")(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    next();
  });
}


app.get("/test", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Admin routes are working",
  });
});


app.get("/db-check", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT NOW() AS current_time"
    );

    return res.status(200).json({
      success: true,
      message: "PostgreSQL connected successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Database error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Database connection failed",
    });
  }
});


app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const result = await pool.query(
      `SELECT id, full_name, email, password_hash
       FROM public.admin_users
       WHERE LOWER(email) = LOWER($1)`,
      [email.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const admin = result.rows[0];


    if (password !== admin.password_hash) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is missing in .env");

      return res.status(500).json({
        success: false,
        message: "Server configuration error",
      });
    }

    const token = jwt.sign(
      {
        id: admin.id,
        email: admin.email,
        role: "admin",
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    return res.status(200).json({
      success: true,
      message: "Admin login successful",
      token,
      admin: {
        id: admin.id,
        full_name: admin.full_name,
        email: admin.email,
      },
    });
  } catch (error) {
    console.error("Admin login error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});


app.get("/services", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT *
       FROM public.services
       ORDER BY id DESC`
    );

    return res.status(200).json({
      success: true,
      services: result.rows,
    });
  } catch (error) {
    console.error("Fetch services error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch services",
      error: error.message,
    });
  }
});


app.get("/services/:id", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT *
       FROM public.services
       WHERE id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    return res.status(200).json({
      success: true,
      service: result.rows[0],
    });
  } catch (error) {
    console.error("Fetch service error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch service",
      error: error.message,
    });
  }
});


app.post("/services", handleUpload, async (req, res) => {
  let uploadedImage = null;

  try {
    const validationError = validateService(req.body);

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    const points = parsePoints(req.body.points);

    uploadedImage = req.file
      ? `/uploads/services/${req.file.filename}`
      : null;

    const result = await pool.query(
      `INSERT INTO public.services
       (title, category, image, description, points, status)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       RETURNING *`,
      [
        req.body.title.trim(),
        req.body.category.trim(),
        uploadedImage,
        req.body.description.trim(),
        JSON.stringify(points),
        req.body.status || "Active",
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Service added successfully",
      service: result.rows[0],
    });
  } catch (error) {
    if (uploadedImage) {
      removeUploadedImage(uploadedImage);
    }

    console.error("Add service error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to add service",
      error: error.message,
    });
  }
});


app.put("/services/:id", handleUpload, async (req, res) => {
  let uploadedImage = null;

  try {
    const validationError = validateService(req.body);

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    const points = parsePoints(req.body.points);

    const existing = await pool.query(
      `SELECT *
       FROM public.services
       WHERE id = $1`,
      [req.params.id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    const oldImage = existing.rows[0].image;

    uploadedImage = req.file
      ? `/uploads/services/${req.file.filename}`
      : null;

    let image = oldImage;

    if (req.file) {
      image = uploadedImage;
    } else if (req.body.removeImage === "true") {
      image = null;
    }

    const result = await pool.query(
      `UPDATE public.services
       SET title = $1,
           category = $2,
           image = $3,
           description = $4,
           points = $5::jsonb,
           status = $6,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING *`,
      [
        req.body.title.trim(),
        req.body.category.trim(),
        image,
        req.body.description.trim(),
        JSON.stringify(points),
        req.body.status || "Active",
        req.params.id,
      ]
    );

    if (oldImage && oldImage !== image) {
      removeUploadedImage(oldImage);
    }

    return res.status(200).json({
      success: true,
      message: "Service updated successfully",
      service: result.rows[0],
    });
  } catch (error) {
    if (uploadedImage) {
      removeUploadedImage(uploadedImage);
    }

    console.error("Update service error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to update service",
      error: error.message,
    });
  }
});


app.delete("/services/:id", async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM public.services
       WHERE id = $1
       RETURNING *`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    removeUploadedImage(result.rows[0].image);

    return res.status(200).json({
      success: true,
      message: "Service deleted successfully",
    });
  } catch (error) {
    console.error("Delete service error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to delete service",
      error: error.message,
    });
  }
});


const handleTeamUpload = (req, res, next) => {
  teamUpload.single("photo")(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        message: err.message || "Photo upload failed.",
      });
    }

    next();
  });
};

const removeTeamPhoto = (photoPath) => {
  if (!photoPath) return;

  const filename = path.basename(photoPath);
  const filePath = path.join(__dirname, "../uploads/team", filename);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};
app.post("/teams", handleTeamUpload, async (req, res) => {
  let uploadedPhoto = null;

  try {
    const { name, bio, display_order, status = "Active" } = req.body;

    if (!name?.trim() || !bio?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Name and bio are required.",
      });
    }

    if (
      display_order === undefined ||
      display_order === "" ||
      !Number.isSafeInteger(Number(display_order)) ||
      Number(display_order) < 1
    ) {
      return res.status(400).json({
        success: false,
        message: "Display order must be a positive whole number.",
      });
    }

    if (!["Active", "Inactive"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be Active or Inactive.",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Team member photo is required.",
      });
    }

    uploadedPhoto = `/uploads/team/${req.file.filename}`;

    const result = await pool.query(
      `INSERT INTO public.team_members
        (name, bio, photo, display_order, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        name.trim(),
        bio.trim(),
        uploadedPhoto,
        Number(display_order),
        status,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Team member added successfully.",
      team: result.rows[0],
    });
  } catch (error) {
    if (uploadedPhoto) {
      removeTeamPhoto(uploadedPhoto);
    }

    console.error("Add team member error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to add team member.",
    });
  }
});



app.get("/teams", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, bio, photo, display_order, status
       FROM public.team_members
       ORDER BY display_order ASC, id DESC`
    );

    return res.status(200).json({
      success: true,
      message: "Team members fetched successfully",
      team: result.rows,
    });
  } catch (error) {
    console.error("Get team members error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch team members",
    });
  }
});

app.put("/teams/:id", handleTeamUpload, async (req, res) => {
  let uploadedPhoto = req.file
    ? `/uploads/team/${req.file.filename}`
    : null;

  try {
    const { id } = req.params;
    const {
      name,
      bio,
      display_order,
      status = "Active",
      removePhoto = "false",
    } = req.body;


    if (!/^\d+$/.test(id)) {
      if (uploadedPhoto) removeTeamPhoto(uploadedPhoto);

      return res.status(400).json({
        success: false,
        message: "Invalid team member ID.",
      });
    }

  
    if (!name?.trim() || !bio?.trim()) {
      if (uploadedPhoto) removeTeamPhoto(uploadedPhoto);

      return res.status(400).json({
        success: false,
        message: "Name and bio are required.",
      });
    }


    if (
      display_order === undefined ||
      display_order === "" ||
      !Number.isSafeInteger(Number(display_order)) ||
      Number(display_order) < 1
    ) {
      if (uploadedPhoto) removeTeamPhoto(uploadedPhoto);

      return res.status(400).json({
        success: false,
        message: "Display order must be a positive whole number.",
      });
    }

   
    if (!["Active", "Inactive"].includes(status)) {
      if (uploadedPhoto) removeTeamPhoto(uploadedPhoto);

      return res.status(400).json({
        success: false,
        message: "Status must be Active or Inactive.",
      });
    }

   
    const existing = await pool.query(
      `SELECT *
       FROM public.team_members
       WHERE id = $1`,
      [Number(id)]
    );

    if (existing.rows.length === 0) {
      if (uploadedPhoto) removeTeamPhoto(uploadedPhoto);

      return res.status(404).json({
        success: false,
        message: "Team member not found.",
      });
    }

    const oldPhoto = existing.rows[0].photo;

    let finalPhoto = oldPhoto;

    if (uploadedPhoto) {
      finalPhoto = uploadedPhoto;
    } else if (removePhoto === "true") {
      finalPhoto = null;
    }

    // Update team member
    const result = await pool.query(
      `UPDATE public.team_members
       SET
         name = $1,
         bio = $2,
         photo = $3,
         display_order = $4,
         status = $5,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [
        name.trim(),
        bio.trim(),
        finalPhoto,
        Number(display_order),
        status,
        Number(id),
      ]
    );

    // Delete old photo after successful database update
    if (oldPhoto && oldPhoto !== finalPhoto) {
      removeTeamPhoto(oldPhoto);
    }

    return res.status(200).json({
      success: true,
      message: "Team member updated successfully.",
      team: result.rows[0],
    });

  } catch (error) {
    if (uploadedPhoto) {
      removeTeamPhoto(uploadedPhoto);
    }

    console.error("Update team member error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update team member.",
      error: error.message,
    });
  }
});


app.delete("/teams/:id", async (req, res) => {
  try {
    const { id } = req.params;

  
    if (!/^\d+$/.test(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid team member ID.",
      });
    }

  
    const result = await pool.query(
      `DELETE FROM public.team_members
       WHERE id = $1
       RETURNING *`,
      [Number(id)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Team member not found.",
      });
    }

    const deletedMember = result.rows[0];

    // Delete associated photo
    if (deletedMember.photo) {
      removeTeamPhoto(deletedMember.photo);
    }

    return res.status(200).json({
      success: true,
      message: "Team member deleted successfully.",
      team: deletedMember,
    });

  } catch (error) {
    console.error("Delete team member error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete team member.",
      error: error.message,
    });
  }
});
app.get("/gallery", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, title, image, created_at
       FROM public.gallery
       ORDER BY id DESC`
    );

    return res.status(200).json({
      success: true,
      message: "Gallery images fetched successfully",
      gallery: result.rows,
    });

  } catch (error) {
    console.error("Gallery GET Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch gallery images",
      error: error.message,
    });
  }
});
app.post("/gallery", (req, res) => {
  galleryUpload.single("image")(req, res, async (uploadError) => {

    if (uploadError) {
      return res.status(400).json({
        success: false,
        message: uploadError.message,
      });
    }

    let uploadedFilePath = null;

    try {
      const { title } = req.body;

      if (!title || !title.trim()) {
        return res.status(400).json({
          success: false,
          message: "Image title is required",
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Please upload an image",
        });
      }

      uploadedFilePath = req.file.path;

      const image = `/uploads/gallery/${req.file.filename}`;

      const result = await pool.query(
        `INSERT INTO public.gallery (title, image)
         VALUES ($1, $2)
         RETURNING id, title, image, created_at`,
        [title.trim(), image]
      );

      return res.status(201).json({
        success: true,
        message: "Gallery image added successfully",
        gallery: result.rows[0],
      });

    } catch (error) {
      console.error("Gallery POST Error:", error);

      if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
        fs.unlinkSync(uploadedFilePath);
      }

      return res.status(500).json({
        success: false,
        message: "Failed to add gallery image",
        error: error.message,
      });
    }
  });
});
app.delete("/gallery/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!/^\d+$/.test(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid gallery ID",
      });
    }

    // Find image before deleting
    const existingImage = await pool.query(
      `SELECT * FROM public.gallery WHERE id = $1`,
      [id]
    );

    if (existingImage.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Gallery image not found",
      });
    }

    const imagePath = existingImage.rows[0].image;

    // Delete database record
    await pool.query(
      `DELETE FROM public.gallery WHERE id = $1`,
      [id]
    );

    // Delete physical image from uploads folder
    if (imagePath && imagePath.startsWith("/uploads/gallery/")) {
      const fileName = path.basename(imagePath);
      const fullPath = path.join(
        __dirname,
        "../uploads/gallery",
        fileName
      );

      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Gallery image deleted successfully",
    });

  } catch (error) {
    console.error("Gallery DELETE Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete gallery image",
      error: error.message,
    });
  }
});
// =====================================
// CREATE CONTACT MESSAGE
// POST /api/admin/contact
// =====================================

app.post("/contact", async (req, res) => {
  try {
    const {
      full_name,
      email,
      phone,
      subject,
      message,
    } = req.body;

    // Validation
    if (
      !full_name?.trim() ||
      !email?.trim() ||
      !subject?.trim() ||
      !message?.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Please fill all required fields.",
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address.",
      });
    }

    // Insert contact message
    const result = await pool.query(
      `INSERT INTO public.contacts
       (full_name, email, phone, subject, message)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        full_name.trim(),
        email.trim().toLowerCase(),
        phone?.trim() || null,
        subject.trim(),
        message.trim(),
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Your message has been submitted successfully.",
      contact: result.rows[0],
    });

  } catch (error) {
    console.error("Contact POST Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to submit contact message.",
      error: error.message,
    });
  }
});
// =====================================
// GET ALL CONTACT MESSAGES
// GET /api/admin/contact
// =====================================

app.get("/contact", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
          id,
          full_name,
          email,
          phone,
          subject,
          message,
          created_at
       FROM public.contacts
       ORDER BY id DESC`
    );

    return res.status(200).json({
      success: true,
      message: "Contact messages fetched successfully.",
      total: result.rows.length,
      contacts: result.rows,
    });

  } catch (error) {
    console.error("Contact GET Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch contact messages.",
      error: error.message,
    });
  }
});
// ==========================================
// DONATION APIs
// ==========================================

// ==========================================
// POST - CREATE DONATION
// POST /api/admin/donations
// ==========================================

app.post(
  "/donations",
  handleDonationUpload,
  async (req, res) => {
    let uploadedScreenshot = null;

    try {
      const {
        donor_name,
        email,
        phone,
        amount,
      } = req.body;

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Payment screenshot is required.",
        });
      }

      uploadedScreenshot = `/uploads/donations/${req.file.filename}`;

      if (
        !donor_name?.trim() ||
        !email?.trim() ||
        amount === undefined ||
        amount === ""
      ) {
        fs.unlinkSync(req.file.path);

        return res.status(400).json({
          success: false,
          message: "Donor name, email and amount are required.",
        });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!emailRegex.test(email.trim())) {
        fs.unlinkSync(req.file.path);

        return res.status(400).json({
          success: false,
          message: "Invalid email address.",
        });
      }

      const donationAmount = Number(amount);

      if (!Number.isFinite(donationAmount) || donationAmount <= 0) {
        fs.unlinkSync(req.file.path);

        return res.status(400).json({
          success: false,
          message: "Invalid donation amount.",
        });
      }

      const result = await pool.query(
        `INSERT INTO public.donations
        (
          donor_name,
          email,
          phone,
          amount,
          payment_status,
          payment_screenshot
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
        [
          donor_name.trim(),
          email.trim().toLowerCase(),
          phone?.trim() || null,
          donationAmount,
          "Pending",
          uploadedScreenshot,
        ]
      );

      return res.status(201).json({
        success: true,
        message: "Donation submitted successfully.",
        data: result.rows[0],
      });

    } catch (error) {
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      console.error("Donation Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to create donation.",
      });
    }
  }
);
// ==========================================
// GET ALL DONATIONS
// GET /api/admin/donations
// ==========================================

app.get("/donations", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        id,
        donor_name,
        email,
        phone,
        amount,
        payment_status,
        payment_screenshot,
        created_at
       FROM public.donations
       ORDER BY created_at DESC, id DESC`
    );

    return res.status(200).json({
      success: true,
      message: "Donations fetched successfully.",
      total: result.rows.length,
      data: result.rows,
    });

  } catch (error) {
    console.error("Fetch Donations Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch donations.",
      error: error.message,
    });
  }
});
// JOB APPLICATION API
// POST /api/admin/job-applications
// =============================================

app.post(
  "/job-applications",
  handleApplicationUpload,
  async (req, res) => {
    const uploadedFiles = req.files || {};

    try {
      const {
        full_name,
        email,
        mobile,
        locality,
        block,
        post_office,
        district,
        state,
        pin_code,
        applying_for,
        reference,
        declaration,
      } = req.body;

      // =====================================
      // 1. REQUIRED FIELD VALIDATION
      // =====================================

      const requiredFields = {
        full_name,
        email,
        mobile,
        locality,
        block,
        post_office,
        district,
        state,
        pin_code,
        applying_for,
      };

      const missingFields = Object.entries(requiredFields)
        .filter(
          ([, value]) =>
            typeof value !== "string" || !value.trim()
        )
        .map(([key]) => key);

      if (missingFields.length > 0) {
        removeJobApplicationFiles(uploadedFiles);

        return res.status(400).json({
          success: false,
          message: "Please fill all required fields.",
          missingFields,
        });
      }

      // =====================================
      // 2. FIELD LENGTH VALIDATION
      // =====================================

      const maxLengths = {
        full_name: 150,
        email: 150,
        mobile: 15,
        locality: 255,
        block: 100,
        post_office: 150,
        district: 100,
        state: 100,
        pin_code: 6,
        applying_for: 100,
        reference: 150,
      };

      for (const [field, maxLength] of Object.entries(maxLengths)) {
        const value = req.body[field];

        if (
          value !== undefined &&
          value !== null &&
          String(value).trim().length > maxLength
        ) {
          removeJobApplicationFiles(uploadedFiles);

          return res.status(400).json({
            success: false,
            message: `${field.replace(/_/g, " ")} cannot exceed ${maxLength} characters.`,
          });
        }
      }

      // =====================================
      // 3. EMAIL VALIDATION
      // =====================================

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!emailRegex.test(email.trim())) {
        removeJobApplicationFiles(uploadedFiles);

        return res.status(400).json({
          success: false,
          message: "Please enter a valid email address.",
        });
      }

      // =====================================
      // 4. MOBILE VALIDATION
      // =====================================

      if (!/^\+?[0-9]{10,15}$/.test(mobile.trim())) {
        removeJobApplicationFiles(uploadedFiles);

        return res.status(400).json({
          success: false,
          message: "Please enter a valid mobile number.",
        });
      }

      // =====================================
      // 5. PIN CODE VALIDATION
      // =====================================

      if (!/^[0-9]{6}$/.test(pin_code.trim())) {
        removeJobApplicationFiles(uploadedFiles);

        return res.status(400).json({
          success: false,
          message: "Please enter a valid 6 digit PIN code.",
        });
      }

      // =====================================
      // 6. DECLARATION VALIDATION
      // =====================================

      if (!["true", "on"].includes(declaration)) {
        removeJobApplicationFiles(uploadedFiles);

        return res.status(400).json({
          success: false,
          message: "Please accept the declaration.",
        });
      }

      // =====================================
      // 7. DOCUMENT VALIDATION
      // =====================================

      const aadharFile = uploadedFiles?.aadhar?.[0];
      const resumeFile = uploadedFiles?.resume?.[0];

      if (!aadharFile || !resumeFile) {
        removeJobApplicationFiles(uploadedFiles);

        return res.status(400).json({
          success: false,
          message: "Aadhar Card and Resume are required.",
        });
      }

      // =====================================
      // 8. DOCUMENT PATHS
      // =====================================

      const uploadsRoot = path.resolve(
        __dirname,
        "../uploads"
      );

      const aadharPath = path
        .relative(uploadsRoot, aadharFile.path)
        .split(path.sep)
        .join("/");

      const resumePath = path
        .relative(uploadsRoot, resumeFile.path)
        .split(path.sep)
        .join("/");

      // =====================================
      // 9. SAVE APPLICATION IN POSTGRESQL
      // =====================================

      const result = await pool.query(
        `INSERT INTO public.job_applications (
          full_name,
          email,
          mobile,
          locality,
          block,
          post_office,
          district,
          state,
          pin_code,
          applying_for,
          reference,
          aadhar_document,
          resume_document,
          declaration
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13, $14
        )
        RETURNING
          id,
          full_name,
          email,
          mobile,
          applying_for,
          application_status,
          created_at`,
        [
          full_name.trim(),
          email.trim().toLowerCase(),
          mobile.trim(),
          locality.trim(),
          block.trim(),
          post_office.trim(),
          district.trim(),
          state.trim(),
          pin_code.trim(),
          applying_for.trim(),
          reference?.trim() || null,
          aadharPath,
          resumePath,
          true,
        ]
      );

      // =====================================
      // 10. SUCCESS RESPONSE
      // =====================================

      return res.status(201).json({
        success: true,
        message: "Your application has been submitted successfully.",
        application: result.rows[0],
      });

    } catch (error) {
      removeJobApplicationFiles(uploadedFiles);

      console.error("Job Application API Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to submit application. Please try again.",
      });
    }
  }
);

// ==========================================
// GET ALL JOB APPLICATIONS
// GET /api/admin/job-applications
// ==========================================

app.get("/job-applications", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        id,
        full_name,
        email,
        mobile,
        locality,
        block,
        post_office,
        district,
        state,
        pin_code,
        applying_for,
        reference,
        aadhar_document,
        resume_document,
        declaration,
        application_status,
        created_at,
        updated_at
      FROM public.job_applications
      ORDER BY created_at DESC, id DESC`
    );

    return res.status(200).json({
      success: true,
      message: "Job applications fetched successfully.",
      total: result.rows.length,
      data: result.rows,
    });

  } catch (error) {
    console.error("Fetch Job Applications Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch job applications.",
      error: error.message,
    });
  }
});

// =============================================
// VIEW JOB APPLICATION DOCUMENT
// GET /api/admin/job-applications/:id/document/:type
// =============================================

app.get(
  "/job-applications/:id/document/:type",
  async (req, res) => {
    try {
      const { id, type } = req.params;

      if (!/^\d+$/.test(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid application ID.",
        });
      }

      if (!["aadhar", "resume"].includes(type)) {
        return res.status(400).json({
          success: false,
          message: "Invalid document type.",
        });
      }

      const result = await pool.query(
        `SELECT aadhar_document, resume_document
         FROM public.job_applications
         WHERE id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Application not found.",
        });
      }

      const documentPath =
        type === "aadhar"
          ? result.rows[0].aadhar_document
          : result.rows[0].resume_document;

      if (!documentPath) {
        return res.status(404).json({
          success: false,
          message: "Document not found.",
        });
      }

      const uploadsRoot = path.resolve(__dirname, "../uploads");
      const absolutePath = path.resolve(uploadsRoot, documentPath);

      // Prevent path traversal outside uploads folder
      if (
        !absolutePath.startsWith(uploadsRoot + path.sep) ||
        !fs.existsSync(absolutePath)
      ) {
        return res.status(404).json({
          success: false,
          message: "Document file not found.",
        });
      }

      const extension = path.extname(absolutePath).toLowerCase();

      const mimeTypes = {
        ".pdf": "application/pdf",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".doc": "application/msword",
        ".docx":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      };

      res.setHeader(
        "Content-Type",
        mimeTypes[extension] || "application/octet-stream"
      );

      res.setHeader("X-Content-Type-Options", "nosniff");

      // Inline = browser preview where supported
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${type}-${id}${extension}"`
      );

      return res.sendFile(absolutePath);

    } catch (error) {
      console.error("View Document Error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to view document.",
      });
    }
  }
);


// =============================================
// DOWNLOAD JOB APPLICATION DOCUMENT
// GET /api/admin/job-applications/:id/download/:type
// =============================================

app.get(
  "/job-applications/:id/download/:type",
  async (req, res) => {
    try {
      const { id, type } = req.params;

      if (!/^\d+$/.test(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid application ID.",
        });
      }

      if (!["aadhar", "resume"].includes(type)) {
        return res.status(400).json({
          success: false,
          message: "Invalid document type.",
        });
      }

      const result = await pool.query(
        `SELECT aadhar_document, resume_document
         FROM public.job_applications
         WHERE id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Application not found.",
        });
      }

      const documentPath =
        type === "aadhar"
          ? result.rows[0].aadhar_document
          : result.rows[0].resume_document;

      if (!documentPath) {
        return res.status(404).json({
          success: false,
          message: "Document not found.",
        });
      }

      const uploadsRoot = path.resolve(__dirname, "../uploads");
      const absolutePath = path.resolve(uploadsRoot, documentPath);

      if (
        !absolutePath.startsWith(uploadsRoot + path.sep) ||
        !fs.existsSync(absolutePath)
      ) {
        return res.status(404).json({
          success: false,
          message: "Document file not found.",
        });
      }

      const extension = path.extname(absolutePath).toLowerCase();

      return res.download(
        absolutePath,
        `${type}-${id}${extension}`
      );

    } catch (error) {
      console.error("Download Document Error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to download document.",
      });
    }
  }
);


// =============================================
// MANAGE ROLES APIs
// =============================================

// GET ALL ROLES
// GET /api/admin/roles

app.get("/roles", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        id,
        title,
        display_order AS "order",
        active,
        created_at,
        updated_at
       FROM public.work_roles
       ORDER BY display_order ASC, id ASC`
    );

    return res.status(200).json({
      success: true,
      message: "Roles fetched successfully",
      total: result.rows.length,
      roles: result.rows,
    });

  } catch (error) {
    console.error("Get Roles Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch roles",
    });
  }
});


// ADD NEW ROLE
// POST /api/admin/roles

app.post("/roles", async (req, res) => {
  try {
    const { title, order = 0, active = true } = req.body;

    if (typeof title !== "string" || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: "Role title is required",
      });
    }

    const displayOrder = Number(order);

    if (
      !Number.isSafeInteger(displayOrder) ||
      displayOrder < 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Display order must be a non-negative integer",
      });
    }

    if (typeof active !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "Active must be true or false",
      });
    }

    const result = await pool.query(
      `INSERT INTO public.work_roles
        (title, display_order, active)
       VALUES ($1, $2, $3)
       RETURNING
         id,
         title,
         display_order AS "order",
         active,
         created_at,
         updated_at`,
      [title.trim(), displayOrder, active]
    );

    return res.status(201).json({
      success: true,
      message: "Role added successfully",
      role: result.rows[0],
    });

  } catch (error) {
    console.error("Add Role Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to add role",
    });
  }
});


// UPDATE ROLE
// PUT /api/admin/roles/:id

app.put("/roles/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { title, order, active } = req.body;

    if (!/^\d+$/.test(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role ID",
      });
    }

    if (typeof title !== "string" || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: "Role title is required",
      });
    }

    const displayOrder = Number(order);

    if (
      !Number.isSafeInteger(displayOrder) ||
      displayOrder < 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid display order",
      });
    }

    if (typeof active !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "Active must be true or false",
      });
    }

    const result = await pool.query(
      `UPDATE public.work_roles
       SET
         title = $1,
         display_order = $2,
         active = $3,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING
         id,
         title,
         display_order AS "order",
         active,
         created_at,
         updated_at`,
      [title.trim(), displayOrder, active, Number(id)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Role not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Role updated successfully",
      role: result.rows[0],
    });

  } catch (error) {
    console.error("Update Role Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update role",
    });
  }
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

app.get("/services", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT *
       FROM public.services
       ORDER BY id DESC`
    );

    return res.status(200).json({
      success: true,
      services: result.rows,
    });
  } catch (error) {
    console.error("Fetch services error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch services",
      error: error.message,
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
router.use((err, req, res, next) => {
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
