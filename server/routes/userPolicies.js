const express = require("express");
const mongoose = require("mongoose");

const UserPolicy = require("../models/UserPolicy");
const Policy = require("../models/Policy");
const auth = require("../middleware/auth");

const router = express.Router();


// --------------------------------------------------
// GET ALL POLICIES OWNED BY LOGGED-IN USER
// GET /api/user-policies
// --------------------------------------------------

router.get("/", auth, async (req, res) => {
    try {
        const userPolicies = await UserPolicy.find({
            user: req.user
        })
            .populate("policy")
            .sort({ createdAt: -1 });

        return res.json({
            userPolicies
        });

    } catch (error) {
        console.error(
            "Get user policies error:",
            error.message
        );

        return res.status(500).json({
            message: "Failed to load your policies"
        });
    }
});


// --------------------------------------------------
// ADD POLICY TO USER ACCOUNT
// POST /api/user-policies
// --------------------------------------------------

router.post("/", auth, async (req, res) => {
    try {
        const {
            policyId,
            selectedCoverage,
            policyNumber,
            policyStartDate,
            policyEndDate
        } = req.body;


        // Validate policy ID
        if (!mongoose.Types.ObjectId.isValid(policyId)) {
            return res.status(400).json({
                message: "Invalid policy ID"
            });
        }


        // Find catalog policy
        const policy = await Policy.findOne({
            _id: policyId,
            isActiveCatalogPlan: true
        });

        if (!policy) {
            return res.status(404).json({
                message: "Policy not found"
            });
        }


        // Validate selected coverage
        const coverage = Number(selectedCoverage);

        if (
            !Number.isFinite(coverage) ||
            coverage <= 0 ||
            !policy.coverageAmounts.includes(coverage)
        ) {
            return res.status(400).json({
                message:
                    "Selected coverage is not available for this policy"
            });
        }


        // Validate dates
        const startDate = new Date(policyStartDate);
        const endDate = new Date(policyEndDate);

        if (
            Number.isNaN(startDate.getTime()) ||
            Number.isNaN(endDate.getTime())
        ) {
            return res.status(400).json({
                message: "Please provide valid policy dates"
            });
        }

        if (endDate <= startDate) {
            return res.status(400).json({
                message:
                    "Policy end date must be after the start date"
            });
        }


        // Create user-owned policy
        const userPolicy = await UserPolicy.create({
            user: req.user,

            policy: policy._id,

            selectedCoverage: coverage,

            policyNumber:
                typeof policyNumber === "string"
                    ? policyNumber.trim()
                    : "",

            policyStartDate: startDate,

            policyEndDate: endDate,

            status:
                endDate >= new Date()
                    ? "Active"
                    : "Expired"
        });


        // Return policy with catalog details
        await userPolicy.populate("policy");

        return res.status(201).json({
            message: "Policy added to your account",
            userPolicy
        });

    } catch (error) {
        console.error(
            "Add user policy error:",
            error.message
        );

        if (error.code === 11000) {
            return res.status(400).json({
                message:
                    "This policy number is already saved in your account"
            });
        }

        return res.status(500).json({
            message: "Failed to add policy"
        });
    }
});


module.exports = router;