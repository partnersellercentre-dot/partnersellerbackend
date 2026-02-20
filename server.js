const express = require("express");
require("dotenv").config();
const cors = require("cors");
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

// ✅ Connect DB
connectDB();

// ✅ Global Request Logger (must be first)
app.use((req, res, next) => {
  console.log(`[REQUEST] ${req.method} ${req.originalUrl}`);
  // Log headers for debugging IPN issues
  if (req.originalUrl.includes("/ipn")) {
    console.log(`[IPN HEADERS]`, JSON.stringify(req.headers));
  }
  next();
});

// ✅ CORS configuration
const allowedOrigins = [
  "https://www.partnersellercentre.shop",
  "https://partnersellercentre-frontend.vercel.app",
  "http://localhost:5173",
];

// Dynamically add FRONTEND_URL from env if it exists, ensuring no trailing slash
if (process.env.FRONTEND_URL) {
  const envUrls = process.env.FRONTEND_URL.split(",").map((url) =>
    url.trim().replace(/\/$/, ""),
  );
  envUrls.forEach((url) => {
    if (url && !allowedOrigins.includes(url)) {
      allowedOrigins.push(url);
    }
  });
}

const corsOptions = {
  origin: function (origin, callback) {
    // 1️⃣ Allow requests with no origin (e.g. mobile apps, postman, server-to-server)
    if (!origin) return callback(null, true);

    // 2️⃣ Normalize origin (remove trailing slash)
    const normalizedOrigin = origin.replace(/\/$/, "");

    // 3️⃣ Check against allowed origins or allow all in development
    if (
      allowedOrigins.includes(normalizedOrigin) ||
      process.env.NODE_ENV === "development"
    ) {
      callback(null, true);
    } else {
      console.log(`[CORS Blocked] Origin: ${origin}`);
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
    "x-nowpayments-sig",
  ],
  optionsSuccessStatus: 200,
};

// ✅ Apply CORS globally — MUST be before routes
app.use(cors(corsOptions));
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
