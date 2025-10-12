// controllers/announcementController.js
const Announcement = require("../models/AnnounceSchema");

// ✅ Admin: Create announcement
const createAnnouncement = async (req, res) => {
  try {
    const { title, message } = req.body;

    if (!title || !message) {
      return res.status(400).json({ error: "Title and message are required" });
    }

    const announcement = new Announcement({
      title,
      message,
      createdBy: req.admin._id,
    });

    await announcement.save();

    res.status(201).json({
      message: "Announcement created successfully",
      announcement,
    });
  } catch (error) {
    console.error("Error creating announcement:", error);
    res.status(500).json({ error: "Server error" });
  }
};

// ✅ Public (Users): Get all announcements
const getAllAnnouncements = async (req, res) => {
  try {
    const announcements = await Announcement.find()
      .populate("createdBy", "username")
      .sort({ createdAt: -1 });

    res.json({ announcements });
  } catch (error) {
    console.error("Error fetching announcements:", error);
    res.status(500).json({ error: "Server error" });
  }
};

// ✅ Admin: Delete announcement
const deleteAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Announcement.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ error: "Announcement not found" });
    }

    res.json({ message: "Announcement deleted successfully" });
  } catch (error) {
    console.error("Error deleting announcement:", error);
    res.status(500).json({ error: "Server error" });
  }
};

module.exports = {
  createAnnouncement,
  getAllAnnouncements,
  deleteAnnouncement,
};
