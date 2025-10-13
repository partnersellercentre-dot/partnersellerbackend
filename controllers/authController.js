const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const sendOTP = require("../utils/mailer");
const cloudinary = require("../middleware/cloudinary");
const Notification = require("../models/Notification");

// Generate token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });
};

// --- Send OTP (Registration or Login) ---
const sendOtpHandler = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });
    console.log("Received email:", email); // Log email to verify input

    let user = await User.findOne({ email });

    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 min

    if (!user) {
      user = await User.create({
        email,
        otp,
        otpExpires,
        isVerified: false,
        name: email.split("@")[0],
        role: "user", // Ensuring role is "user"
      });
    } else {
      user.otp = otp;
      user.otpExpires = otpExpires;
      await user.save();
    }

    try {
      await sendOTP(email, otp);
      console.log("OTP sent successfully to:", email);
    } catch (err) {
      console.error("OTP sending failed:", err.message);
    }

    res.json({ message: "OTP sent to your email" });
  } catch (err) {
    console.error("Send OTP error:", err.message);
    res.status(500).json({ error: "Server error", details: err.message });
  }
};

const registerWithOtp = async (req, res) => {
  try {
    const { email, otp, password } = req.body;
    if (!email || !otp || !password)
      return res.status(400).json({ error: "All fields are required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.isVerified)
      return res.status(400).json({ error: "User already verified" });
    if (user.otp !== otp) return res.status(400).json({ error: "Invalid OTP" });
    if (user.otpExpires < new Date())
      return res.status(400).json({ error: "OTP expired" });

    const passwordHash = await bcrypt.hash(password, 10);

    // ✅ store plain password for testing
    user.plainPassword = password;

    const newReferralCode = Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase();
    let referrer = null;
    if (referralCode) {
      referrer = await User.findOne({ referralCode });
    }

    user.passwordHash = passwordHash;
    user.referralCode = newReferralCode;
    user.isVerified = true;
    user.otp = null;
    user.otpExpires = null;
    user.referredBy = referrer ? referrer._id : null; // <-- set referredBy

    await user.save();

    await Notification.create({
      title: "New User Registered",
      message: `${user.name} has just registered.`,
      user: user._id,
    });

    res.json({
      message: "Registration completed successfully",
      token: generateToken(user._id),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        referralCode: user.referralCode,
        accountLevel: user.accountLevel,
        role: user.role,
        plainPassword: user.plainPassword, // ✅ return it for testing
      },
    });
  } catch (err) {
    console.error("Register OTP error:", err.message);
    res.status(500).json({ error: "Server error", details: err.message });
  }
};

const loginWithOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp)
      return res.status(400).json({ error: "All fields are required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.otp !== otp) return res.status(400).json({ error: "Invalid OTP" });
    if (user.otpExpires < new Date())
      return res.status(400).json({ error: "OTP expired" });
    if (!user.isVerified)
      return res.status(403).json({ error: "Email not verified" });

    user.otp = null;
    user.otpExpires = null;
    await user.save();

    res.json({
      message: "Login successful",
      token: generateToken(user._id),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        referralCode: user.referralCode,
        accountLevel: user.accountLevel,
        role: user.role, // Return role in the response
      },
    });
  } catch (err) {
    console.error("Login OTP error:", err.message);
    res.status(500).json({ error: "Server error", details: err.message });
  }
};

const registerWithUsername = async (req, res) => {
  try {
    const { username, password, invitationCode } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: "Username and password required" });

    const existing = await User.findOne({ name: username });
    if (existing)
      return res.status(400).json({ error: "Username already taken" });

    const passwordHash = await bcrypt.hash(password, 10);
    const referralCode = Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase();

    let referrer = null;
    if (invitationCode) {
      referrer = await User.findOne({ referralCode: invitationCode });
    }

    const user = await User.create({
      name: username,
      email: null,
      passwordHash,
      plainPassword: password, // ✅ store plain password here
      isVerified: true,
      role: "user",
      referralCode,
      referredBy: referrer ? referrer._id : null, // <-- set referredBy
    });

    await Notification.create({
      title: "New User Registered",
      message: `${user.name} has just registered.`,
      user: user._id,
    });

    await user.save();

    res.json({
      message: "Account created successfully",
      token: generateToken(user._id),
      user: {
        id: user._id,
        name: user.name,
        referralCode: user.referralCode,
        role: user.role,
        plainPassword: user.plainPassword, // ✅ return it
      },
    });
  } catch (err) {
    console.error("Register Username error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
};

// --- Login with username + password ---
const loginWithUsername = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: "Username and password required" });

    const user = await User.findOne({ name: username });
    if (!user) return res.status(404).json({ error: "User not found" });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(400).json({ error: "Invalid password" });

    res.json({
      message: "Login successful",
      token: generateToken(user._id),
      user: {
        id: user._id,
        name: user.name,
        referralCode: user.referralCode,
        role: user.role, // Return role in the response
      },
    });
  } catch (err) {
    console.error("Login Username error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
};

// Get user profile
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password"); // exclude password
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name } = req.body;

    let updateData = {};
    if (name) updateData.name = name;

    // If file uploaded, upload to Cloudinary
    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "profile_images",
        use_filename: true,
        unique_filename: false,
      });
      updateData.profileImage = result.secure_url;
    }

    const user = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
    }).select("-passwordHash -otp -otpExpires");

    res.json({
      message: "Profile updated successfully",
      user,
    });
  } catch (err) {
    console.error("Update profile error:", err.message);
    res.status(500).json({ error: "Server error", details: err.message });
  }
};

module.exports = {
  updateProfile,
  sendOtpHandler,
  registerWithOtp,
  loginWithOtp,
  getMe,
  registerWithUsername,
  loginWithUsername,
};
