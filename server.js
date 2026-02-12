const express = require("express");
require("dotenv").config();

// ✅ Validate sensitive environment variables
if (process.env.NODE_ENV === "production") {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.error(
      "❌ FATAL ERROR: JWT_SECRET is missing or too weak (min 32 chars).",
    );
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

// ✅ Security Headers
app.use(helmet());

// ✅ Trust proxy - Essential for rate limiting behind Vercel/Cloudflare
app.set("trust proxy", 1);

// ✅ Sanitization
app.use(mongoSanitize()); // Prevent NoSQL injection
app.use(xss()); // Prevent XSS

// ✅ Connect DB
connectDB();

// ✅ CORS configuration
const allowedOrigins = [
  process.env.FRONTEND_URL || "http://localhost:5173",
  "https://www.partnersellercentre.shop",
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "Origin",
  ],
};

// ✅ Apply CORS globally — MUST be before routes
app.use(cors(corsOptions));

// ✅ Rate limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests, please try again later.",
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 attempts per 15 minutes
  skipSuccessfulRequests: true,
});

// Apply global limiter to all API routes
app.use("/api/", globalLimiter);

// Strict limiter for auth endpoints
app.use("/api/auth/login-username", authLimiter);
app.use("/api/auth/login-otp", authLimiter);
app.use("/api/auth/register-username", authLimiter);
app.use("/api/auth/register-otp", authLimiter);
app.use("/api/auth/send-otp", authLimiter);
app.use("/api/auth/forgot-password", authLimiter);
app.use("/api/admin/login", authLimiter);

// ✅ Ensure preflight requests handled globally
app.options("*", cors(corsOptions));

// ✅ Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// ✅ Local development
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Server running locally on port ${PORT}`));
}

// ✅ Export app for Vercel serverless
module.exports = app;
