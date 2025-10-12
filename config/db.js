const mongoose = require("mongoose");

let isConnected = false; // track connection state

const connectDB = async () => {
  if (isConnected) return; // use existing connection

  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log("MONGO_URI:", process.env.MONGO_URI.replace(/:.+@/, ":****@"));
    isConnected = conn.connections[0].readyState === 1;
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error("❌ MongoDB connection error:", error.message);
    throw new Error("MongoDB connection failed");
  }
};

module.exports = connectDB;
