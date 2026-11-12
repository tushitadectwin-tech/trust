
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

// Donation upload folder
const uploadDir = path.join(
  __dirname,
  "../uploads/donations"
);

// Create folder automatically
fs.mkdirSync(uploadDir, { recursive: true });

// Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();

    cb(
      null,
      `${crypto.randomUUID()}${extension}`
    );
  },
});

// Allowed image formats
const fileFilter = (req, file, cb) => {
  const allowedTypes = {
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
    "image/webp": [".webp"],
  };

  const extension = path.extname(file.originalname).toLowerCase();

  const validExtensions = allowedTypes[file.mimetype];

  if (
    !validExtensions ||
    !validExtensions.includes(extension)
  ) {
    return cb(
      new Error("Only JPG, JPEG, PNG and WEBP images are allowed.")
    );
  }

  cb(null, true);
};

// Multer configuration
const donationUpload = multer({
  storage,
  fileFilter,

  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
    files: 1,
  },
});

// Error handling middleware
const handleDonationUpload = (req, res, next) => {
  donationUpload.single("payment_screenshot")(
    req,
    res,
    (error) => {
      if (error) {
        return res.status(400).json({
          success: false,
          message:
            error.code === "LIMIT_FILE_SIZE"
              ? "Screenshot must be less than 5MB."
              : error.message,
        });
      }

      next();
    }
  );
};

module.exports = handleDonationUpload;
