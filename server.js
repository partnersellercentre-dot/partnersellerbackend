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

// ✅ CORS configuration (simple, safe for both local + production)
const corsOptions = {
  origin: [
    "http://localhost:5173",
    "https://partnersellercentre-frontend-4ih8p6sfr.vercel.app", // "https://www.partnersellercentre.shop", // <-- REMOVE trailing slash
  ],
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

// ✅ Ensure preflight requests handled globally
app.options("*", cors(corsOptions));

// ✅ Body parser
app.use(express.json());

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
app.use("/api/notifications", notificationRoutes);
app.use("/api/referral", require("./routes/referralRoutes"));
app.use("/api/announcements", announcementRoutes);
app.use("/api/statistics", require("./routes/useStatistics"));

// ✅ Local development
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Server running locally on port ${PORT}`));
}

// ✅ Export app for Vercel serverless
module.exports = app;
