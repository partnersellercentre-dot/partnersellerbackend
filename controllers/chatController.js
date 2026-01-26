const ChatMessage = require("../models/ChatMessage");
const User = require("../models/User");
const Pusher = require("pusher");
const cloudinary = require("../middleware/cloudinary");

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_APP_KEY,
  secret: process.env.PUSHER_APP_SECRET,
  cluster: process.env.PUSHER_APP_CLUSTER,
  useTLS: true,
});

// User: Get their chat history
exports.getUserMessages = async (req, res) => {
  try {
    const messages = await ChatMessage.find({ user: req.user._id }).sort({
      timestamp: 1,
    });
    res.json({ success: true, messages });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// User: Send message to admin
exports.sendMessageToAdmin = async (req, res) => {
  const { message } = req.body;
  try {
    let imageUrl = null;

    if (req.file) {
      const streamUpload = (buffer) => {
        return new Promise((resolve, reject) => {
          cloudinary.uploader
            .upload_stream({ folder: "chat_images" }, (error, result) => {
              if (result) resolve(result);
              else reject(error);
            })
            .end(buffer);
        });
      };
      const result = await streamUpload(req.file.buffer);
      imageUrl = result.secure_url;
    }

    const newMessage = await ChatMessage.create({
      sender: req.user._id,
      user: req.user._id,
      message: message || "",
      imageUrl,
      isAdmin: false,
    });

    // Trigger Pusher for Admin
    pusher.trigger("admin-chat", "new-message", {
      message: newMessage,
    });

    res.json({ success: true, message: newMessage });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Admin: Get list of users with messages
exports.getChatUsers = async (req, res) => {
  try {
    const users = await ChatMessage.distinct("user");
    const userDetails = await User.find({ _id: { $in: users } }).select(
      "name email",
    );

    // For each user, get the last message
    const usersWithLastMessage = await Promise.all(
      userDetails.map(async (u) => {
        const lastMsg = await ChatMessage.findOne({ user: u._id }).sort({
          timestamp: -1,
        });
        return {
          ...u._doc,
          lastMessage: lastMsg,
        };
      }),
    );

    res.json({ success: true, users: usersWithLastMessage });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Admin: Get history for specific user
exports.getAdminUserMessages = async (req, res) => {
  const { userId } = req.params;
  try {
    const messages = await ChatMessage.find({ user: userId }).sort({
      timestamp: 1,
    });
    res.json({ success: true, messages });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Admin: Reply to user
exports.replyToUser = async (req, res) => {
  const { userId } = req.params;
  const { message } = req.body;
  try {
    let imageUrl = null;

    if (req.file) {
      const streamUpload = (buffer) => {
        return new Promise((resolve, reject) => {
          cloudinary.uploader
            .upload_stream({ folder: "chat_images" }, (error, result) => {
              if (result) resolve(result);
              else reject(error);
            })
            .end(buffer);
        });
      };
      const result = await streamUpload(req.file.buffer);
      imageUrl = result.secure_url;
    }

    const newMessage = await ChatMessage.create({
      sender: req.admin._id, // Admin ID from adminProtect middleware
      user: userId,
      message: message || "",
      imageUrl,
      isAdmin: true,
    });

    // Trigger Pusher for User
    pusher.trigger(`user-chat-${userId}`, "new-message", {
      message: newMessage,
    });

    res.json({ success: true, message: newMessage });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
