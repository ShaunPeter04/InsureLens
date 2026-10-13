const idempotency = require("../middleware/idempotency")();

const express = require("express");
const { isValidId, validateRejectionCase } = require("../utils/insuranceValidation");

const RejectionCase = require("../models/RejectionCase");
const UserPolicy = require("../models/UserPolicy");
const ClaimCase = require("../models/ClaimCase");
const auth = require("../middleware/auth");
const { analyzeRejection } = require("../services/rejectionAnalyzer");
const { predictRejectionML } = require("../services/rejectionMLService");

const router = express.Router();

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
        select: "-uploadedDocument.extractedText -uploadedDocument.filePath -uploadedDocument.fileName",
        match: { user: req.user },
        populate: { path: "policy" }
      })
      .sort({ createdAt: -1 });

    return res.json({ rejectionCases });
  } catch (error) {
    console.error("Get rejection cases failed");
    return res.status(500).json({
      message: "Failed to load rejection cases"
    });
  }
});

// CREATE REJECTION CASE
router.post("/", auth, idempotency, async (req, res) => {
  try {
    const { error: validationError, data } = validateRejectionCase(req.body);
    if (validationError) return res.status(400).json({ message: validationError });
    const {
      userPolicy,
      claimCase,
      rejectionReason,
      insurerRemarks,
      rejectedAmount,
      rejectionDate
    } = data;

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

    const reasonText = cleanText(
    `${rejectionReason || ""} ${insurerRemarks || ""}`
    )
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

    const requiresHospitalization =
    reasonText.includes("initial waiting") ||
    reasonText.includes("waiting period") ||
    reasonText.includes("first 30 days") ||
    reasonText.includes("30 day waiting") ||
    reasonText.includes("policy too new");

    if (requiresHospitalization && !claimCase) {
    return res.status(400).json({
        message:
        "Please select a hospitalization case to verify the waiting period."
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

    const amount = rejectedAmount;
    const parsedDate = rejectionDate ? new Date(rejectionDate) : null;

    req.writeAttempted = true;
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
    if (error.name === "ValidationError" || error.name === "CastError") {
      return res.status(400).json({ message: "Invalid rejection details" });
    }
    return res.status(req.writeAttempted ? 503 : 500).json({
      message: req.writeAttempted ? "The save status could not be confirmed. Check your saved rejection cases before submitting again." : "Failed to create rejection case"
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
        select: "-uploadedDocument.extractedText -uploadedDocument.filePath -uploadedDocument.fileName",
        match: { user: req.user },
      populate: { path: "policy" }
    });

    if (!rejectionCase) {
      return res.status(404).json({
        message: "Rejection case not found"
      });
    }

    return res.json({ rejectionCase });
  } catch (error) {
    console.error("Get rejection case failed");
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
        match: { user: req.user },
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
    }).lean(); // Do not normalize impossible stored calendar dates through hydration.
    if (!linkedClaimCase) return res.status(400).json({ message: "Linked hospitalization is unavailable or does not belong to this policy" });
    }


    const analysis = analyzeRejection(
    rejectionCase,
    policyData,
    userPolicy,
    linkedClaimCase
    );
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
    console.error("Analyze rejection failed");

    return res.status(500).json({
      message: "Failed to analyze rejected claim"
    });
  }
});


module.exports = router;
