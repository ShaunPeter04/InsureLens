const idempotency = require("../middleware/idempotency")();
const express = require("express");
const { validateSavedPolicy } = require("../utils/insuranceValidation");
const fs = require("fs");
const path = require("path");
const axios = require("axios");


const UserPolicy = require("../models/UserPolicy");
const Policy = require("../models/Policy");
const auth = require("../middleware/auth");
const policyUpload = require("../middleware/policyUpload");

const { extractedTerms, publicPolicy } = require("../utils/pdfValidation");
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
    const pdfBuffer = await fs.promises.readFile(path.resolve(file.path));

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
            userPolicies: userPolicies.map(publicPolicy)
        });

    } catch (error) {
        console.error(
            "Get user policies failed"
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

router.post("/", auth, idempotency, async (req, res) => {
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
        req.writeAttempted = true;
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

        return res.status(req.writeAttempted ? 503 : 500).json({
            message: req.writeAttempted ? "The save status could not be confirmed. Check your saved policies before submitting again." : "Failed to add policy"
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
    idempotency,
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
            await fs.promises.chmod(req.file.path, 0o600);
            const header = await fs.promises.open(req.file.path, "r");
            let signature;
            try { const buffer = Buffer.alloc(5); await header.read(buffer, 0, 5, 0); signature = buffer.toString("ascii"); }
            finally { await header.close(); }
            if (signature !== "%PDF-") return res.status(400).json({message:"The file is not a valid PDF policy document."});
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

            if (extractionResult.extractionMethod !== "PDF Text" || typeof extractionResult.extractedText !== "string" || !Number.isSafeInteger(extractionResult.characterCount) || extractionResult.characterCount < 100 || !Number.isSafeInteger(extractionResult.pageCount) || extractionResult.pageCount < 1 || extractionResult.pageCount > 50 || !extractionResult.extractedPolicyData || Array.isArray(extractionResult.extractedPolicyData) || typeof extractionResult.extractedPolicyData !== "object") {
                return res.status(502).json({message:"The extraction service returned incomplete information. Please try again."});
            }
            const extractedText = extractionResult.extractedText.slice(0, 12000);

            // Create uploaded user policy
            req.writeAttempted = true;
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

                extractedPolicyData: extractedTerms(extractionResult.extractedPolicyData)

            });


            saved = true;
            return res.status(201).json({
                message:
                    "Policy PDF uploaded successfully",
                userPolicy: publicPolicy(userPolicy)
            });

        } catch (error) {
            if (error.name === "ValidationError" || error.name === "CastError") {
                req.writeAttempted = false;
                return res.status(400).json({ message: "Invalid uploaded policy details" });
            }

            if (error.code === 11000) {
                req.writeAttempted = false;
                return res.status(400).json({
                    message:
                        "This policy number is already saved in your account"
                });
            }

            if (req.writeAttempted) return res.status(503).json({message:"The save status could not be confirmed. Check your saved policies before submitting again."});
            if ([400, 413, 422].includes(error.response?.status)) {
                const message = /password/i.test(error.response?.data?.detail || "")
                    ? "Password-protected PDFs are not supported. Use an unencrypted copy."
                    : "The PDF could not be read. Use a valid, unencrypted text-based policy PDF (1–50 pages, maximum 10 MB). Scanned PDFs are not supported in this demonstration.";
                return res.status(error.response.status).json({ message });
            }
            if (error.code === "ECONNABORTED" || error.response?.status === 504) return res.status(504).json({message:"PDF processing timed out. Use a smaller text-based PDF and try again."});
            return res.status(503).json({ message: "Policy extraction is unavailable. Please try again later." });
        } finally {
            // Only remove this request's temporary upload when no policy was saved.
            if (!saved && !req.writeAttempted && req.file?.path) {
                await fs.promises.unlink(req.file.path).catch(() => {});
            }
        }
    }
);


module.exports = router;
