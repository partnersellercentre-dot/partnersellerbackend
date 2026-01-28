const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const sendOTP = require("../utils/mailer");
const cloudinary = require("../middleware/cloudinary");
const Notification = require("../models/Notification");
const KYC = require("../models/KYC");
const SystemSettings = require("../models/SystemSettings");
const WalletTransaction = require("../models/WalletTransaction");

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
    const { email, otp, password, referralCode } = req.body;
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

    const newReferralCode = Math.floor(
      1000000000 + Math.random() * 9000000000,
    ).toString();
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

    // Apply Signup Bonus
    const settings = await SystemSettings.findOne();
    const signupBonus = settings ? Number(settings.signupBonus) || 0 : 0;
    // Removed immediate referral bonus logic

    if (signupBonus > 0) {
      user.balance = (user.balance || 0) + signupBonus;
      user.profitBalance = (user.profitBalance || 0) + signupBonus;
      await WalletTransaction.create({
        user: user._id,
        amount: signupBonus,
        type: "bonus",
        status: "approved",
        direction: "in",
        method: "Signup Bonus",
      });
    }

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
    const { username, password, invitationCode, email } = req.body;
    if (!username || !password || !email)
      return res
        .status(400)
        .json({ error: "Username, password, and email are required" });

    const existingUsername = await User.findOne({ name: username });
    if (existingUsername)
      return res.status(400).json({ error: "Username already taken" });

    const existingEmail = await User.findOne({ email });
    if (existingEmail)
      return res.status(400).json({ error: "Email already registered" });

    const passwordHash = await bcrypt.hash(password, 10);
    const referralCode = Math.floor(
      1000000000 + Math.random() * 9000000000,
    ).toString();

    let referrer = null;
    if (invitationCode) {
      referrer = await User.findOne({ referralCode: invitationCode });
    }

    const user = await User.create({
      name: username,
      email,
      passwordHash,
      plainPassword: password, // ✅ store plain password here
      isVerified: true,
      role: "user",
      referralCode,
      referredBy: referrer ? referrer._id : null, // <-- set referredBy
    });

    // Apply Signup Bonus
    const settings = await SystemSettings.findOne();
    const signupBonus = settings ? Number(settings.signupBonus) || 0 : 0;

    if (signupBonus > 0) {
      user.balance = (user.balance || 0) + signupBonus;
      user.profitBalance = (user.profitBalance || 0) + signupBonus;
      await WalletTransaction.create({
        user: user._id,
        amount: signupBonus,
        type: "bonus",
        status: "approved",
        direction: "in",
        method: "Signup Bonus",
      });
    }

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

// --- Forgot Password ---
const forgotPassword = async (req, res) => {
  try {
    const { username, email } = req.body;
    if (!username || !email)
      return res.status(400).json({ error: "Username and Email are required" });

    const user = await User.findOne({ name: username, email });
    if (!user)
      return res.status(404).json({
        error: "No user found with this username and email combination",
      });

    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 min

    user.otp = otp;
    user.otpExpires = otpExpires;
    await user.save();

    await sendOTP(email, otp);

    res.json({ message: "Reset OTP sent to your email" });
  } catch (err) {
    console.error("Forgot password error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
};

// --- Reset Password ---
const resetPassword = async (req, res) => {
  try {
    const { username, otp, newPassword } = req.body;
    if (!username || !otp || !newPassword)
      return res.status(400).json({ error: "All fields are required" });

    const user = await User.findOne({ name: username });
    if (!user) return res.status(404).json({ error: "User not found" });

    if (user.otp !== otp) return res.status(400).json({ error: "Invalid OTP" });
    if (user.otpExpires < new Date())
      return res.status(400).json({ error: "OTP expired" });

    const passwordHash = await bcrypt.hash(newPassword, 10);
    user.passwordHash = passwordHash;
    user.plainPassword = newPassword; // Keep it in sync if you're using it
    user.otp = null;
    user.otpExpires = null;
    await user.save();

    res.json({ message: "Password reset successful" });
  } catch (err) {
    console.error("Reset password error:", err.message);
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
    // Check KYC status
    const kyc = await KYC.findOne({ user: req.user.id });
    const isKycApproved = kyc && kyc.status === "approved";
    res.json({ ...user.toObject(), isKycApproved });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

const updateProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    console.log("Update Body:", req.body);
    const { name, email } = req.body;

    let updateData = {};
    if (name) updateData.name = name;

    if (email && email.trim() !== "") {
      console.log("Updating email to:", email);
      // Check if email is already taken by another user
      const existingUser = await User.findOne({
        email: email.trim(),
        _id: { $ne: userId },
      });

      if (existingUser) {
        return res.status(400).json({ error: "Email is already in use" });
      }
      updateData.email = email.trim();
    }

    // If file uploaded, upload to Cloudinary
    if (req.file) {
      console.log("File uploaded, processing image...");
      const streamUpload = (buffer) => {
        return new Promise((resolve, reject) => {
          cloudinary.uploader
            .upload_stream({ folder: "profile_images" }, (error, result) => {
              if (result) resolve(result);
              else reject(error);
            })
            .end(buffer);
        });
      };
      const result = await streamUpload(req.file.buffer);
      updateData.profileImage = result.secure_url;
    }

    console.log("Final updateData to be saved:", updateData);

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      {
        new: true,
        runValidators: true,
      },
    ).select("-passwordHash -otp -otpExpires");

    console.log("Updated User Result:", user);

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
  forgotPassword,
  resetPassword,
};
