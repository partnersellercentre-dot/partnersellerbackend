const express = require("express");
const router = express.Router();
const upload = require("../middleware/multer"); // ✅ memoryStorage
const {
  createKYC,
  getAllKYC,
  getKYCById,
  getMyKYC,
  updateKYC,
  deleteKYC,
} = require("../controllers/kycController");

const { protect } = require("../middleware/authMiddleware");

router.get("/my-kyc", protect, getMyKYC); // ✅ protect this
// Routes
router.post(
  "/",
  protect,
  upload.fields([{ name: "idFront" }, { name: "idBack" }]),
  createKYC
);

router.get("/", getAllKYC);
router.get("/:id", getKYCById);

router.put(
  "/:id",
  upload.fields([{ name: "idFront" }, { name: "idBack" }]),
  updateKYC
);

router.delete("/:id", deleteKYC);

module.exports = router;
