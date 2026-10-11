
const express = require("express");
const mongoose = require("mongoose");

const RejectionCase = require("../models/RejectionCase");
const UserPolicy = require("../models/UserPolicy");
const ClaimCase = require("../models/ClaimCase");
const auth = require("../middleware/auth");
const { analyzeRejection } = require("../services/rejectionAnalyzer");
const { predictRejectionML } = require("../services/rejectionMLService");

const router = express.Router();

const isValidId = (id) =>
  mongoose.Types.ObjectId.isValid(id);

const cleanText = (value) =>
  typeof value === "string" ? value.trim() : "";

// GET ALL REJECTION CASES
router.get("/", auth, async (req, res) => {
  try {
    const rejectionCases = await RejectionCase.find({
      user: req.user
    })
      .populate({
        path: "userPolicy",
        populate: { path: "policy" }
      })
      .sort({ createdAt: -1 });

    return res.json({ rejectionCases });
  } catch (error) {
    console.error("Get rejection cases error:", error);
    return res.status(500).json({
      message: "Failed to load rejection cases"
    });
  }
});

// CREATE REJECTION CASE
router.post("/", auth, async (req, res) => {
  try {
    const {
      userPolicy,
      claimCase,
      rejectionReason,
      insurerRemarks,
      rejectedAmount,
      rejectionDate
    } = req.body;

    if (!isValidId(userPolicy)) {
      return res.status(400).json({
        message: "Please select a valid insurance policy"
      });
    }

    if (!cleanText(rejectionReason)) {
      return res.status(400).json({
        message: "Rejection reason is required"
      });
    }

    const savedPolicy = await UserPolicy.findOne({
      _id: userPolicy,
      user: req.user
    });

    if (!savedPolicy) {
      return res.status(404).json({
        message: "Policy not found in your account"
      });
    }

    let linkedClaimCase = null;

    if (claimCase) {
      if (!isValidId(claimCase)) {
        return res.status(400).json({
          message: "Invalid claim case ID"
        });
      }

      linkedClaimCase = await ClaimCase.findOne({
        _id: claimCase,
        user: req.user,
        userPolicy: savedPolicy._id
      });

      if (!linkedClaimCase) {
        return res.status(400).json({
          message:
            "Claim case must belong to the selected policy"
        });
      }
    }

    const amount = Number(rejectedAmount ?? 0);

    if (!Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({
        message: "Invalid rejected amount"
      });
    }

    let parsedDate = null;

    if (rejectionDate) {
      parsedDate = new Date(rejectionDate);

      if (Number.isNaN(parsedDate.getTime())) {
        return res.status(400).json({
          message: "Invalid rejection date"
        });
      }
    }

    const rejectionCase = await RejectionCase.create({
      user: req.user,
      userPolicy: savedPolicy._id,
      claimCase: linkedClaimCase?._id ?? null,
      rejectionReason: cleanText(rejectionReason),
      insurerRemarks: cleanText(insurerRemarks),
      rejectedAmount: amount,
      rejectionDate: parsedDate
    });

    return res.status(201).json({
      message: "Rejection case created successfully",
      rejectionCase
    });
  } catch (error) {
    console.error("Create rejection case error:", error);
    return res.status(500).json({
      message: "Failed to create rejection case"
    });
  }
});

// GET ONE REJECTION CASE
router.get("/:caseId", auth, async (req, res) => {
  try {
    if (!isValidId(req.params.caseId)) {
      return res.status(400).json({
        message: "Invalid rejection case ID"
      });
    }

    const rejectionCase = await RejectionCase.findOne({
      _id: req.params.caseId,
      user: req.user
    }).populate({
      path: "userPolicy",
      populate: { path: "policy" }
    });

    if (!rejectionCase) {
      return res.status(404).json({
        message: "Rejection case not found"
      });
    }

    return res.json({ rejectionCase });
  } catch (error) {
    console.error("Get rejection case error:", error);
    return res.status(500).json({
      message: "Failed to load rejection case"
    });
  }
});


// ANALYZE A REJECTED CLAIM
router.get("/:caseId/analyze", auth, async (req, res) => {
  try {
    const { caseId } = req.params;

    if (!isValidId(caseId)) {
      return res.status(400).json({
        message: "Invalid rejection case ID"
      });
    }

    const rejectionCase = await RejectionCase.findOne({
      _id: caseId,
      user: req.user
    }).populate({
      path: "userPolicy",
      populate: {
        path: "policy"
      }
    });

    if (!rejectionCase) {
      return res.status(404).json({
        message: "Rejection case not found"
      });
    }

    const userPolicy = rejectionCase.userPolicy;

    if (!userPolicy) {
      return res.status(400).json({
        message: "Saved insurance policy is unavailable"
      });
    }

    let policyData;

    if (userPolicy.sourceType === "Uploaded") {
      policyData = userPolicy.extractedPolicyData;
    } else {
      policyData = userPolicy.policy;
    }

    if (!policyData) {
      return res.status(400).json({
        message: "Policy information is unavailable"
      });
    }

    let linkedClaimCase = null;

    if (rejectionCase.claimCase) {
    linkedClaimCase = await ClaimCase.findOne({
        _id: rejectionCase.claimCase,
        user: req.user,
        userPolicy: userPolicy._id
    });
    }

    const analysis = analyzeRejection(
    rejectionCase,
    policyData,
    userPolicy,
    linkedClaimCase
    );
    console.log("Rule-based analysis result:", analysis);
    const mlPrediction = await predictRejectionML(
    rejectionCase.rejectionReason,
    rejectionCase.insurerRemarks
    );



    return res.json({
      rejectionCaseId: rejectionCase._id,
      policyName: policyData.policyName || "Unnamed Policy",
      rejectionReason: rejectionCase.rejectionReason,
      rejectedAmount: rejectionCase.rejectedAmount,
      analysis,
      mlPrediction

    });

  } catch (error) {
    console.error("Analyze rejection error:", error);

    return res.status(500).json({
      message: "Failed to analyze rejected claim"
    });
  }
});


module.exports = router;
