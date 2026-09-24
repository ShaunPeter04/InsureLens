const express = require("express");
const Policy = require("../models/Policy");
const auth = require("../middleware/auth");

const router = express.Router();


// CREATE A NEW POLICY
// Protected for now.
// Later: restrict this route to admin users only.
router.post("/", auth, async (req, res) => {
  try {
    const policy = new Policy(req.body);

    await policy.save();

    res.status(201).json({
      message: "Policy created successfully",
      policy
    });

  } catch (error) {
    console.error(error);

    // Mongoose validation error
    if (error.name === "ValidationError") {
      return res.status(400).json({
        message: "Invalid policy data",
        error: error.message
      });
    }

    // Duplicate policyId
    if (error.code === 11000) {
      return res.status(400).json({
        message: "Policy ID already exists"
      });
    }

    res.status(500).json({
      message: "Server error"
    });
  }
});


// GET ALL POLICIES
// Public route
router.get("/", async (req, res) => {
  try {
    const policies = await Policy.find();

    res.json({
      policies
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error"
    });
  }
});


// GET ONE POLICY BY MONGODB ID
// Public route
router.get("/:id", async (req, res) => {
  try {
    const policy = await Policy.findById(req.params.id);

    if (!policy) {
      return res.status(404).json({
        message: "Policy not found"
      });
    }

    res.json({
      policy
    });

  } catch (error) {
    console.error(error);

    // Invalid MongoDB ObjectId
    if (error.name === "CastError") {
      return res.status(400).json({
        message: "Invalid policy ID"
      });
    }

    res.status(500).json({
      message: "Server error"
    });
  }
});


module.exports = router;