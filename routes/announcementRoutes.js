// routes/announcementRoutes.js
const express = require("express");
const {
  createAnnouncement,
  getAllAnnouncements,
  deleteAnnouncement,
} = require("../controllers/announcementController");
const { adminProtect, admin } = require("../middleware/authMiddleware");

const router = express.Router();

// ✅ Public - Anyone (User or Guest)
router.get("/", getAllAnnouncements);

// ✅ Admin-only routes
router.post("/", adminProtect, admin, createAnnouncement);
router.delete("/:id", adminProtect, admin, deleteAnnouncement);

module.exports = router;
