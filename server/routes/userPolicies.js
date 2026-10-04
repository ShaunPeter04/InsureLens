const express = require("express");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const axios = require("axios");


const UserPolicy = require("../models/UserPolicy");
const Policy = require("../models/Policy");
const auth = require("../middleware/auth");
const policyUpload = require("../middleware/policyUpload");

const router = express.Router();
const extractPolicyText = async (file) => {
    const pdfBuffer = fs.readFileSync(
        path.resolve(file.path)
    );

    const formData = new FormData();

    formData.append(
        "policyDocument",
        new Blob(
            [pdfBuffer],
            { type: "application/pdf" }
        ),
        file.originalname
    );

    const mlServiceUrl =
        process.env.ML_SERVICE_URL
            .trim()
            .replace(/\/+$/, "");

    const response = await axios.post(
        `${mlServiceUrl}/extract-policy-text`,
        formData,
        {
            timeout: 30000
        }
    );

    return response.data;
};

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
            sourceType: "Catalog",
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

// --------------------------------------------------
// UPLOAD USER'S OWN POLICY PDF
// POST /api/user-policies/upload
// --------------------------------------------------

router.post(
    "/upload",
    auth,
    policyUpload.single("policyDocument"),
    async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    message: "Please upload a policy PDF"
                });
            }

            const {
                selectedCoverage,
                policyNumber,
                policyStartDate,
                policyEndDate
            } = req.body;


            // Validate coverage
            const coverage = Number(selectedCoverage);

            if (
                !Number.isFinite(coverage) ||
                coverage <= 0
            ) {
                return res.status(400).json({
                    message:
                        "Please provide a valid coverage amount"
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
                    message:
                        "Please provide valid policy dates"
                });
            }

            if (endDate <= startDate) {
                return res.status(400).json({
                    message:
                        "Policy end date must be after the start date"
                });
            }

            // Extract text from uploaded PDF using FastAPI
            const extractionResult =
                await extractPolicyText(req.file);

            const extractedText =
                extractionResult.extractedText || "";

            // Create uploaded user policy
            const userPolicy = await UserPolicy.create({
                user: req.user,

                sourceType: "Uploaded",

                policy: null,

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
                        : "Expired",

                uploadedDocument: {
                    originalName: req.file.originalname,
                    fileName: req.file.filename,
                    filePath: req.file.path,
                    mimeType: req.file.mimetype,
                    fileSize: req.file.size,
                    extractedText: extractedText,
                    extractionMethod:
                        extractionResult.extractionMethod || "Not Processed"
                },

                extractedPolicyData: {
                    insuranceCompany:
                        extractionResult.extractedPolicyData?.insuranceCompany || "",

                    policyName:
                        extractionResult.extractedPolicyData?.policyName || "",

                    waitingPeriods: {
                        initialDays:
                            extractionResult.extractedPolicyData
                                ?.waitingPeriods?.initialDays ?? 0,

                        specificIllnessesMonths:
                            extractionResult.extractedPolicyData
                                ?.waitingPeriods?.specificIllnessesMonths ?? 0,

                        specificIllnessConditions:
                            extractionResult.extractedPolicyData
                                ?.waitingPeriods?.specificIllnessConditions ?? [],

                        preExistingDiseasesMonths:
                            extractionResult.extractedPolicyData
                                ?.waitingPeriods?.preExistingDiseasesMonths ?? 0
                    },

                    roomRentLimit: {
                        hasCap:
                            extractionResult.extractedPolicyData
                                ?.roomRentLimit?.hasCap ?? false,

                        percentageOfSumInsured:
                            extractionResult.extractedPolicyData
                                ?.roomRentLimit?.percentageOfSumInsured ?? 0
                    },
                    hospitalizationCoverage: {
                        inpatientCovered:
                            extractionResult.extractedPolicyData
                                ?.hospitalizationCoverage?.inpatientCovered ?? false,

                        minimumHospitalizationHours:
                            extractionResult.extractedPolicyData
                                ?.hospitalizationCoverage?.minimumHospitalizationHours ?? 0,

                        daycareTreatmentsCovered:
                            extractionResult.extractedPolicyData
                                ?.hospitalizationCoverage?.daycareTreatmentsCovered ?? false
                    },
                    majorExclusions:
                        extractionResult.extractedPolicyData
                            ?.majorExclusions ?? [],
                    subLimits:
                        extractionResult.extractedPolicyData
                            ?.subLimits ?? []
                }
            });


            return res.status(201).json({
                message:
                    "Policy PDF uploaded successfully",
                userPolicy
            });

        } catch (error) {
            console.error(
                "Upload policy error:",
                error
            );

            if (error.code === 11000) {
                return res.status(400).json({
                    message:
                        "This policy number is already saved in your account"
                });
            }

            return res.status(500).json({
                message:
                    "Failed to upload policy PDF"
            });
        }
    }
);


module.exports = router;