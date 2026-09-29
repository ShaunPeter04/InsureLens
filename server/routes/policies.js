const express = require("express");
const Policy = require("../models/Policy");

const router = express.Router();



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