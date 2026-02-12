const Notification = require("../models/Notification");

// ✅ Create a new notification
exports.createNotification = async (req, res) => {
  try {
    const { title, message, user } = req.body;

    const notification = await Notification.create({
      title,
      message,
      user,
    });

    res.status(201).json({ success: true, notification });
  } catch (error) {
    console.error("Error creating notification:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ✅ Get all notifications (admin)
exports.getAllNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find()
      .populate("user", "name email")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, notifications });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ✅ Mark as read
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;

    if (id === "all") {
      await Notification.updateMany(
        { user: req.user.id, isRead: false },
        { isRead: true },
      );
      return res
        .status(200)
        .json({ success: true, message: "All notifications marked as read" });
    }

    const notification = await Notification.findOne({
      _id: id,
      user: req.user.id,
    });
    if (!notification) {
      return res
        .status(404)
        .json({ success: false, message: "Notification not found" });
    }

    notification.isRead = true;
    await notification.save();

    res.status(200).json({ success: true, notification });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
