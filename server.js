const express = require("express");
require("dotenv").config();

// ✅ Validate sensitive environment variables
if (process.env.NODE_ENV === "production") {
  const requiredEnvVars = [
    "JWT_SECRET",
    "MONGO_URI",
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
    "PUSHER_APP_ID",
    "PUSHER_APP_KEY",
    "PUSHER_APP_SECRET",
    "PUSHER_APP_CLUSTER",
  ];

  requiredEnvVars.forEach((varName) => {
    if (!process.env[varName]) {
      console.error(`❌ FATAL ERROR: ${varName} is missing in production.`);
      process.exit(1);
    }
  });

  if (process.env.JWT_SECRET.length < 32) {
    console.error("❌ FATAL ERROR: JWT_SECRET must be at least 32 characters.");
    process.exit(1);
  }
}

const cors = require("cors");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");
const helmet = require("helmet");
const connectDB = require("./config/db");

// Import routes
const walletRoutes = require("./routes/walletRoutes");
const authRoutes = require("./routes/authRoutes");
const productRoutes = require("./routes/productRoutes");
const adminRoutes = require("./routes/adminRoutes");
const kycRoutes = require("./routes/kycRoutes");
const purchaseRoutes = require("./routes/purchaseRoutes");
const settingsRoutes = require("./routes/settingsRoutes");
const announcementRoutes = require("./routes/announcementRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const depositRoutes = require("./routes/depositRoutes");

const app = express();

// ✅ CORS (Allow all origins for production)
app.use(cors());

// ✅ HTTPS Enforcement in production
app.use((req, res, next) => {
  if (
    process.env.NODE_ENV === "production" &&
    !req.secure &&
    req.get("x-forwarded-proto") !== "https"
  ) {
    return res.redirect(`https://${req.hostname}${req.url}`);
  }
  next();
});

// ✅ Security Headers
app.use(helmet());

// ✅ Trust proxy - Essential for rate limiting behind Vercel/Cloudflare
app.set("trust proxy", 1);

// ✅ Sanitization
app.use(mongoSanitize()); // Prevent NoSQL injection
app.use(xss()); // Prevent XSS

// ✅ Body parser with size limits (#20)
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// ✅ Connect DB
connectDB();

// ✅ Health check
app.get("/", (req, res) => {
  res.send("Backend API is running 🚀");
});

// ✅ API routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/products", productRoutes);
app.use("/api/kyc", kycRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/deposit", depositRoutes);
app.use("/api/nowpayments", require("./routes/nowpaymentsRoutes"));
app.use("/api/notifications", notificationRoutes);
app.use("/api/referral", require("./routes/referralRoutes"));
app.use("/api/announcements", announcementRoutes);
app.use("/api/statistics", require("./routes/useStatistics"));
app.use("/api/chat", require("./routes/chatRoutes"));
app.use("/api/safepay", require("./routes/safepayRoutes"));

// ✅ Global Error Handler (#15)
app.use((err, req, res, next) => {
  console.error(err.stack);

  // Don't leak internal error details to the client in production
  const message =
    process.env.NODE_ENV === "production"
      ? "An internal server error occurred"
      : err.message;

  res.status(err.status || 500).json({
    error: message,
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
});

// ✅ Local development
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Server running locally on port ${PORT}`));
}

// ✅ Export app for Vercel serverless
module.exports = app;
