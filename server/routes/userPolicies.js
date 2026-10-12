const express = require("express");
const { validateSavedPolicy } = require("../utils/insuranceValidation");
const fs = require("fs");
const path = require("path");
const axios = require("axios");


const UserPolicy = require("../models/UserPolicy");
const Policy = require("../models/Policy");
const auth = require("../middleware/auth");
const policyUpload = require("../middleware/policyUpload");

const router = express.Router();

async function duplicatePolicy(user, data, sourceType) {
    if (data.policyNumber) return UserPolicy.findOne({ user, policyNumber: data.policyNumber });
    // Unnumbered catalog policies with identical coverage and dates are accidental repeats.
    if (sourceType === "Catalog") return UserPolicy.findOne({
        user, sourceType, policy: data.policyId, policyNumber: "",
        selectedCoverage: data.selectedCoverage,
        policyStartDate: new Date(data.policyStartDate), policyEndDate: new Date(data.policyEndDate)
    });
    return null;
}

// Return upload errors as JSON rather than Express's default HTML response.
function receivePolicyDocument(req, res, next) {
    policyUpload.single("policyDocument")(req, res, (error) => {
        if (!error) return next();
        if (error.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({ message: "Policy PDF must be no larger than 10 MB" });
        }
        if (error.name === "MulterError" || error.code?.startsWith("LIMIT_") || error.message === "Only PDF policy documents are allowed.") {
            return res.status(400).json({ message: "Upload one PDF policy document (maximum 10 MB)" });
        }
        return res.status(500).json({ message: "Unable to receive the policy PDF. Please try again." });
    });
}
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
            .select("-uploadedDocument.extractedText")
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
        const { error: validationError, data } = validateSavedPolicy(req.body);
        if (validationError) return res.status(400).json({ message: validationError });
        const { policyId, selectedCoverage: coverage, policyNumber, policyStartDate, policyEndDate } = data;

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


        const { error: coverageError } = validateSavedPolicy(req.body, { coverageAmounts: policy.coverageAmounts });
        if (coverageError) return res.status(400).json({ message: coverageError });
        if (await duplicatePolicy(req.user, data, "Catalog")) {
            return res.status(400).json({ message: "This policy is already saved in your account" });
        }
        const startDate = new Date(policyStartDate);
        const endDate = new Date(policyEndDate);

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
        if (error.name === "ValidationError" || error.name === "CastError") {
            return res.status(400).json({ message: "Invalid policy details" });
        }

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
    receivePolicyDocument,
    async (req, res) => {
        let saved = false;
        try {
            if (!req.file) {
                return res.status(400).json({
                    message: "Please upload a policy PDF"
                });
            }

            if (req.file.mimetype !== "application/pdf" || req.file.size <= 0 || req.file.size > 10 * 1024 * 1024) {
                return res.status(400).json({ message: "Upload a nonempty policy PDF no larger than 10 MB" });
            }
            const { error: validationError, data } = validateSavedPolicy(req.body, { uploaded: true });
            if (validationError) return res.status(400).json({ message: validationError });
            if (await duplicatePolicy(req.user, data, "Uploaded")) {
                return res.status(400).json({ message: "This policy number is already saved in your account" });
            }
            const { selectedCoverage: coverage, policyNumber, policyStartDate, policyEndDate } = data;
            const startDate = new Date(policyStartDate);
            const endDate = new Date(policyEndDate);

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
                                ?.waitingPeriods?.initialDays ?? null,

                        specificIllnessesMonths:
                            extractionResult.extractedPolicyData
                                ?.waitingPeriods?.specificIllnessesMonths ?? null,

                        specificIllnessConditions:
                            extractionResult.extractedPolicyData
                                ?.waitingPeriods?.specificIllnessConditions ?? [],

                        preExistingDiseasesMonths:
                            extractionResult.extractedPolicyData
                                ?.waitingPeriods?.preExistingDiseasesMonths ?? null
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


            saved = true;
            return res.status(201).json({
                message:
                    "Policy PDF uploaded successfully",
                userPolicy
            });

        } catch (error) {
            if (error.name === "ValidationError" || error.name === "CastError") {
                return res.status(400).json({ message: "Invalid uploaded policy details" });
            }

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
        } finally {
            // Only remove this request's temporary upload when no policy was saved.
            if (!saved && req.file?.path) {
                await fs.promises.unlink(req.file.path).catch(() => {});
            }
        }
    }
);


module.exports = router;