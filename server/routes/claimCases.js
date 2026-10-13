const idempotency = require("../middleware/idempotency")();
const express = require("express");
const { isValidId, validateClaimCase } = require("../utils/insuranceValidation");

const ClaimCase = require("../models/ClaimCase");
const UserPolicy = require("../models/UserPolicy");
const User = require("../models/User");
const auth = require("../middleware/auth");

const { validateStoredAnalysis, diseases } = require("../utils/analysisValidation");

const { analyzeWaitingPeriods, validDate } = require("../services/waitingPeriodAnalyzer");

const { uploadedClaimAnalysis } = require("../services/uploadedPolicyReview");
const router = express.Router();

// ==================================================
// GET ALL CLAIM CASES FOR LOGGED-IN USER
// ==================================================

router.get("/", auth, async (req, res) => {
    try {
        const claimCases = await ClaimCase.find({
            user: req.user
        })
            .populate({
                path: "userPolicy", select: "-uploadedDocument.extractedText -uploadedDocument.filePath -uploadedDocument.fileName",
            match: { user: req.user },
                populate: {
                    path: "policy"
                }
            })
            .sort({ createdAt: -1 });

        return res.json({
            claimCases
        });

    } catch (error) {
        console.error(
            "Get claim cases failed"
        );

        return res.status(500).json({
            message: "Failed to load claim cases"
        });
    }
});

// ==================================================
// CREATE CLAIM CASE
// ==================================================

router.post("/", auth, idempotency, async (req, res) => {
    try {
        const { error, data } = validateClaimCase(req.body);
        if (error) return res.status(400).json({ message: error });

        const savedPolicy = await UserPolicy.findOne({ _id: data.userPolicy, user: req.user });
        if (!savedPolicy) return res.status(404).json({ message: "Policy was not found in your account" });

        let familyMember = null;
        if (data.patientType === "Family Member") {
            const user = await User.findById(req.user);
            if (!user) return res.status(404).json({ message: "User not found" });
            const member = user.familyMembers.id(data.familyMember);
            if (!member) return res.status(400).json({ message: "Selected family member does not belong to your account" });
            familyMember = member._id;
        }

        req.writeAttempted = true;
        const claimCase = await ClaimCase.create({
            ...data, user: req.user, userPolicy: savedPolicy._id, familyMember
        });
        await claimCase.populate({ path: "userPolicy", select: "-uploadedDocument.extractedText -uploadedDocument.filePath -uploadedDocument.fileName", match: { user: req.user }, populate: { path: "policy" } });
        return res.status(201).json({ message: "Hospitalization case created successfully", claimCase });
    } catch (error) {
        if (error.name === "ValidationError" || error.name === "CastError") {
            return res.status(400).json({ message: "Invalid hospitalization details" });
        }
        return res.status(req.writeAttempted ? 503 : 500).json({ message: req.writeAttempted ? "The save status could not be confirmed. Check your saved hospitalization cases before submitting again." : "Failed to create hospitalization case" });
    }
});

// ==================================================
// ANALYZE CLAIM CASE
// ==================================================

router.get("/:caseId/analyze", auth, async (req, res) => {
    try {
        if (
            !isValidId(
                req.params.caseId
            )
        ) {
            return res.status(400).json({
                message: "Invalid claim case ID"
            });
        }

        const claimCase = await ClaimCase.findOne({
            _id: req.params.caseId,
            user: req.user
        }).populate({
            path: "userPolicy",
            match: { user: req.user },
            populate: {
                path: "policy",
                options: { lean: false }
            },
            options: { lean: false }
        }).lean(); // Preserve malformed legacy dates for strict calendar validation.

        if (!claimCase) {
            return res.status(404).json({
                message: "Claim case not found"
            });
        }

        const userPolicy = claimCase.userPolicy;

        if (!userPolicy) {
            return res.status(400).json({
                message:
                    "Saved policy information is unavailable"
            });
        }

        let policyData;

        if (
            userPolicy.sourceType === "Uploaded" ||
            !userPolicy.policy
        ) {
            policyData = userPolicy.extractedPolicyData;

            if (!policyData) {
                return res.status(400).json({
                    message:
                        "Extracted policy information is unavailable"
                });
            }
        } else {
            policyData = userPolicy.policy;
        }

        const analysisError = validateStoredAnalysis(claimCase, userPolicy, policyData, { allowIncompleteWaiting: true });
        if (analysisError) return res.status(400).json({ message: `${analysisError}. Please complete the saved details before analysis.` });

        if (userPolicy.sourceType === "Uploaded") {
            return res.json(uploadedClaimAnalysis(claimCase, userPolicy, policyData));
        }

        let patientPreExistingDiseases = [];

        if (claimCase.patientType === "Self") {
            const user = await User.findById(req.user);

            patientPreExistingDiseases =
                user?.insuranceRequirements
                    ?.preExistingDiseases || [];
        }

        if (
            claimCase.patientType === "Family Member" &&
            claimCase.familyMember
        ) {
            const user = await User.findById(req.user);

            const member = user?.familyMembers?.id(
                claimCase.familyMember
            );

            patientPreExistingDiseases =
                member?.preExistingDiseases || [];
        }

        if (!diseases(patientPreExistingDiseases)) {
            return res.status(400).json({ message: "Pre-existing disease information is invalid. Please update the patient's profile." });
        }

        const waiting = analyzeWaitingPeriods(policyData, userPolicy, claimCase);
        const admissionDate = validDate(claimCase.admissionDate);
        const policyStartDate = validDate(userPolicy.policyStartDate);
        const policyEndDate = validDate(userPolicy.policyEndDate);
        const policyActive = admissionDate && policyStartDate && policyEndDate
            ? admissionDate >= policyStartDate && admissionDate <= policyEndDate && policyEndDate > policyStartDate
            : null;
        const policyAgeDays = waiting.policyAgeDays;
        const initialWaitingDays = waiting.initial.waitingDays;
        const initialWaitingSatisfied = waiting.initial.passed;

        const hospitalizationCoverage =
            policyData.hospitalizationCoverage;

        let hospitalizationCovered = false;
        let hospitalizationHours = null;
        let requiredHospitalizationHours = 0;

        if (
            claimCase.hospitalizationType === "Inpatient"
        ) {
            hospitalizationCovered =
                hospitalizationCoverage?.inpatientCovered === true;

            requiredHospitalizationHours =
                hospitalizationCoverage
                    ?.minimumHospitalizationHours ?? 24;

            if (
                claimCase.admissionTime &&
                claimCase.dischargeTime &&
                validDate(claimCase.admissionDate) && validDate(claimCase.dischargeDate)
            ) {
                const admission = new Date(
                    claimCase.admissionDate
                );

                const discharge = new Date(
                    claimCase.dischargeDate
                );

                const [admissionHour, admissionMinute] =
                    claimCase.admissionTime
                        .split(":")
                        .map(Number);

                const [dischargeHour, dischargeMinute] =
                    claimCase.dischargeTime
                        .split(":")
                        .map(Number);

                admission.setUTCHours(
                    admissionHour,
                    admissionMinute,
                    0,
                    0
                );

                discharge.setUTCHours(
                    dischargeHour,
                    dischargeMinute,
                    0,
                    0
                );

                hospitalizationHours =
                    (discharge - admission) /
                    (1000 * 60 * 60);
            }
        }

        if (
            claimCase.hospitalizationType === "Day Care"
        ) {
            hospitalizationCovered =
                hospitalizationCoverage
                    ?.daycareTreatmentsCovered === true;
        }

        const minimumHoursSatisfied =
            claimCase.hospitalizationType === "Day Care"
                ? true
                : hospitalizationHours !== null &&
                hospitalizationHours >=
                    requiredHospitalizationHours;
        const roomRentRule = policyData.roomRentLimit || {};

        const selectedCoverage =
            Number(userPolicy.selectedCoverage);

        const actualRoomRent =
            claimCase.roomRentPerDay == null ||
            Number(claimCase.roomRentPerDay) <= 0
                ? null
                : Number(claimCase.roomRentPerDay);

        let allowedRoomRent = null;
        let roomRentPassed = true;
        let roomRentReason = "";

        if (!roomRentRule.hasCap) {
            roomRentReason =
                "This policy has no room-rent cap.";
        } else {
            const limits = [];

            // Percentage-based room-rent limit
            if (
                Number(roomRentRule.percentageOfSumInsured) > 0
            ) {
                const percentageLimit =
                    selectedCoverage *
                    (Number(
                        roomRentRule.percentageOfSumInsured
                    ) / 100);

                limits.push(percentageLimit);
            }

            // Fixed per-day room-rent limit
            if (Number(roomRentRule.maxPerDay) > 0) {
                limits.push(
                    Number(roomRentRule.maxPerDay)
                );
            }

            // If both limits exist, use the stricter one
            if (limits.length > 0) {
                allowedRoomRent = Math.min(...limits);

                roomRentPassed =
                    actualRoomRent === null
                        ? null
                        : actualRoomRent <= allowedRoomRent;
                if (actualRoomRent === null) {
                    roomRentReason =
                        `Room rent was not provided. The policy allows up to ₹${allowedRoomRent.toLocaleString("en-IN")} per day, but eligibility cannot be verified.`;
                } else {
                    roomRentReason = roomRentPassed
                        ? `Room rent of ₹${actualRoomRent.toLocaleString("en-IN")} per day is within the allowed limit of ₹${allowedRoomRent.toLocaleString("en-IN")} per day.`
                        : `Room rent of ₹${actualRoomRent.toLocaleString("en-IN")} per day exceeds the allowed limit of ₹${allowedRoomRent.toLocaleString("en-IN")} per day.`;
                }
            } else {
                roomRentPassed = null;
                roomRentReason =
                    "A room-rent restriction is recorded, but no numeric room-rent limit is available. Room-rent eligibility cannot be verified and requires manual review.";
            }
        }

        const allowedRoomType =
            roomRentRule.roomTypeAllowed ||
            "No Restriction";

        let roomTypePassed = true;

        if (
            roomRentRule.hasCap &&
            allowedRoomType !== "No Restriction" &&
            claimCase.roomType
        ) {
            roomTypePassed =
                claimCase.roomType
                    .trim()
                    .toLowerCase() ===
                allowedRoomType
                    .trim()
                    .toLowerCase();
        }

        const totalBillAmount =
            Number(claimCase.totalBillAmount || 0);

        const sumInsured =
            Number(userPolicy.selectedCoverage || 0);

        const coveragePassed =
            totalBillAmount <= sumInsured;

        const amountWithinCoverage = Math.min(
            totalBillAmount,
            sumInsured
        );

        const excessOverCoverage = Math.max(
            0,
            totalBillAmount - sumInsured
        );

        // ------------------------------------------
        // MANUAL NON-PAYABLE EXPENSES
        // ------------------------------------------

        const nonPayableExpenses =
            claimCase.nonPayableExpenses || [];

        const totalNonPayableExpenses =
            nonPayableExpenses.reduce(
                (total, expense) =>
                    total + Number(expense.amount || 0),
                0
            );

        // Calculate the potentially eligible amount first.
        // Non-payable expenses are assumed to be included
        // in the total hospital bill.

        const amountAfterNonPayableExpenses =
            Math.max(
                0,
                totalBillAmount - totalNonPayableExpenses
            );

        const amountWithinCoverageAfterExpenses =
            Math.min(
                amountAfterNonPayableExpenses,
                sumInsured
            );


        // ------------------------------------------
        // CO-PAYMENT AND DEDUCTIBLE
        // ------------------------------------------

        const coPaymentPercentage =
            Number(policyData.coPaymentPercentage || 0);

        const deductibleAmount =
            Number(policyData.deductibleAmount || 0);

        const eligibleAmount = Math.max(
            0,
            amountWithinCoverageAfterExpenses
        );

        const estimatedDeductible = Math.min(
            Math.max(0, deductibleAmount),
            eligibleAmount
        );

        const amountAfterDeductible = Math.max(
            0,
            eligibleAmount - estimatedDeductible
        );

        const safeCoPaymentPercentage = Math.min(
            100,
            Math.max(0, coPaymentPercentage)
        );

        const estimatedCoPayment =
            amountAfterDeductible *
            (safeCoPaymentPercentage / 100);

        const estimatedAmountAfterBasicDeductions =
            Math.max(
                0,
                amountAfterDeductible -
                    estimatedCoPayment
            );

        // Declared history and diagnosis text are review hints, not independent
        // proof that this hospitalization is for a pre-existing disease.
        const normalizedDiagnosis = typeof claimCase.diagnosis === "string"
            ? claimCase.diagnosis.trim().toLowerCase() : "";
        const matchedPreExistingDiseases = patientPreExistingDiseases.filter(disease =>
            disease.trim().toLowerCase() === normalizedDiagnosis
        );
        const pedWaitingPeriod = {
            ...waiting.preExistingDisease,
            requiredMonths: waiting.preExistingDisease.waitingMonths,
            patientPreExistingDiseases,
            matchedPreExistingDiseases
        };
        const specificIllnessWaitingPeriod = {
            ...waiting.specificIllness,
            requiredMonths: waiting.specificIllness.waitingMonths
        };

        const majorExclusions =
            policyData.majorExclusions || [];

        const subLimits =
            policyData.subLimits || [];
        
        // ------------------------------------------
        // SUB-LIMIT MATCHING
        // ------------------------------------------

        const normalizeSubLimitText = (value = "") =>
            value
                .toLowerCase()
                .replace(/[^a-z0-9\s]/g, " ")
                .replace(/\s+/g, " ")
                .trim();

        const normalizedClaimForSubLimits =
            normalizeSubLimitText(
                `${claimCase.diagnosis || ""} ${claimCase.treatment || ""}`
            );

        const matchedSubLimits =
            subLimits.filter((subLimit) => {
                const category =
                    normalizeSubLimitText(
                        subLimit.category || ""
                    );

                if (!category) {
                    return false;
                }

                return (
                    normalizedClaimForSubLimits.includes(category) ||
                    category.includes(normalizedClaimForSubLimits)
                );
            });

        const importantConditions =
            policyData.importantConditions || [];

        const preExistingConditionsRules =
            policyData.preExistingConditionsRules || [];

        // ------------------------------------------
        // DIAGNOSIS-AWARE EXCLUSION CHECK
        // ------------------------------------------

        const diagnosisText =
            `${claimCase.diagnosis || ""} ${claimCase.treatment || ""}`
                .toLowerCase()
                .trim();

        const matchedExclusions =
            majorExclusions.filter((exclusion) => {
                if (
                    typeof exclusion !== "string" ||
                    !exclusion.trim()
                ) {
                    return false;
                }

                const exclusionText =
                    exclusion.toLowerCase().trim();

                return (
                    diagnosisText.includes(exclusionText) ||
                    exclusionText.includes(diagnosisText)
                );
            });

        const hasMatchedExclusion =
            matchedExclusions.length > 0;

        // ------------------------------------------
        // KNOWN CLAIM BLOCKERS
        // ------------------------------------------

        const blockingIssues = [];

        // Waiting timelines never establish PED/specific-illness applicability
        // from text alone. These assessments remain in manual review.

        // Major exclusion blocker
        if (hasMatchedExclusion) {
            blockingIssues.push(
                `The diagnosis or treatment directly matches a major policy exclusion: ${matchedExclusions.join(", ")}.`
            );
        }

        const hasBlockingIssues =
            blockingIssues.length > 0;


        const analysis = {
            policyActive: {
                passed: policyActive,

                message: policyActive === null
                    ? "Policy commencement, end date or admission information is missing or invalid."
                    : policyActive ? "Policy was active on the admission date." : "Policy was not active on the admission date."
            },

            detailedWaitingPeriodAnalysis: waiting,
            initialWaitingPeriod: {
                ...waiting.initial,
                policyAgeDays,
                requiredDays: initialWaitingDays
            },
            pedWaitingPeriod,
         hospitalizationCoverage: {
                passed:
                    hospitalizationCovered && minimumHoursSatisfied,

                hospitalizationType:
                    claimCase.hospitalizationType,
                hospitalizationHours,
                requiredHospitalizationHours:
                    claimCase.hospitalizationType ===
                    "Inpatient"
                        ? requiredHospitalizationHours
                        : null,

                message:
                    !hospitalizationCovered
                        ? `${claimCase.hospitalizationType} hospitalization is not marked as covered under this policy.`
                        : hospitalizationHours === null && claimCase.hospitalizationType === "Inpatient"
                            ? "Hospitalization duration cannot be verified from the recorded dates and times."
                        : !minimumHoursSatisfied
                            ? `Hospitalization duration was ${hospitalizationHours?.toFixed(1)} hours, below the required ${requiredHospitalizationHours} hours.`
                            : claimCase.hospitalizationType ===
                                "Day Care"
                                ? "Day-care treatment is covered under this policy."
                                : `Hospitalization duration was ${hospitalizationHours?.toFixed(1)} hours and satisfies the ${requiredHospitalizationHours}-hour requirement.`
            },
            
            roomRent: {
                passed:
                    roomRentPassed === null
                        ? null
                        : roomRentPassed && roomTypePassed,

                actualPerDay: actualRoomRent,
                allowedPerDay: allowedRoomRent,

                actualRoomType:
                    claimCase.roomType || null,

                allowedRoomType,

                exceedsLimit:
                    roomRentPassed === false,

                potentialProportionateDeduction:
                    roomRentPassed === false ||
                    roomTypePassed === false,

                deductionAmount: null,

                requiresManualReview:
                    roomRentPassed !== true ||
                    roomTypePassed === false ||
                    (
                        roomRentRule.hasCap &&
                        allowedRoomRent === null
                    ),

                message:
                    roomRentPassed === false
                        ? `${roomRentReason} Additional room-rent-related deductions may apply depending on the policy wording. The deduction amount cannot be determined from the available information.`
                        : !roomTypePassed
                            ? `Selected room type "${claimCase.roomType}" does not match the policy room eligibility "${allowedRoomType}". Additional deductions may apply, subject to policy wording.`
                            : roomRentReason
            },

            coverage: {
                passed: coveragePassed,

                totalBillAmount,
                sumInsured,
                excessOverCoverage,

                message: coveragePassed
                    ? `The bill amount of ₹${totalBillAmount.toLocaleString(
                        "en-IN"
                    )} is within the selected sum insured of ₹${sumInsured.toLocaleString(
                        "en-IN"
                    )}.`
                    : `The bill amount exceeds the selected sum insured by ₹${excessOverCoverage.toLocaleString(
                        "en-IN"
                    )}.`
            },
            financialImpact: {
                nonPayableExpenses,
                totalNonPayableExpenses,
                amountAfterNonPayableExpenses,
                coPaymentPercentage,
                estimatedCoPayment,

                deductibleAmount,
                estimatedDeductible,

                estimatedAmountAfterBasicDeductions,

                message:
                    "This is a preliminary estimate after deducting user-reported non-payable expenses and applying the stored sum-insured limit, co-payment, and deductible. Reported expenses have not been independently verified against the insurer's policy. Additional deductions may apply for other non-payable items, room-rent restrictions, treatment sub-limits, policy exclusions, and other applicable conditions. The final payable amount must be verified against the insurer's claim settlement statement.",
            },
            requiresReview: {
                pedWaitingPeriod,
                specificIllnessWaitingPeriod,
                waitingPolicyWording: waiting.policyWordingToReview,

                exclusionCheck: {
                    matched:
                        hasMatchedExclusion,

                    matchedExclusions,

                    message:
                        hasMatchedExclusion
                            ? `The diagnosis or treatment directly matches ${matchedExclusions.length} stored policy exclusion(s).`
                            : "No direct match was found between the diagnosis/treatment and the stored major exclusions."
                },

                preExistingConditionRules:
                    preExistingConditionsRules,

                majorExclusions,

                subLimits: {
                    matched: matchedSubLimits.length > 0,
                    matchedSubLimits,
                    allSubLimits: subLimits,
                    message:
                        matchedSubLimits.length > 0
                            ? `${matchedSubLimits.length} potentially applicable sub-limit(s) were found for this claim.`
                            : "No direct sub-limit match was found for the diagnosis or treatment."
                },

                importantConditions,

                message:
                    "These policy provisions require diagnosis/treatment-specific review before a claimability conclusion is made."
            }
        };

        let claimabilityScore = 0;
        let maximumScore = 0;

        // 1. Policy active — 25 points
        maximumScore += 25;

        if (policyActive) {
            claimabilityScore += 25;
        }

        // 2. Initial waiting period — 20 points
        maximumScore += 20;

        if (initialWaitingSatisfied) {
            claimabilityScore += 20;
        }

        // 3. Hospitalization eligibility — 20 points
        maximumScore += 20;

        if (
            hospitalizationCovered &&
            minimumHoursSatisfied
        ) {
            claimabilityScore += 20;
        }

        // 4. Room-rent compliance — 15 points
        if (roomRentPassed === null) {
            // Room rent is unknown.
            // Exclude this check from the score.
        } else {
            maximumScore += 15;

            if (roomRentPassed && roomTypePassed) {
                claimabilityScore += 15;
            }
        }
        // 5. Sum-insured availability — 20 points
        maximumScore += 20;

        if (coveragePassed) {
            claimabilityScore += 20;
        }

        claimabilityScore = Math.round(
            (claimabilityScore / maximumScore) * 100
        );

        let assessment;

        if (hasBlockingIssues) {
            assessment = "Likely Not Claimable";
        } else if (claimabilityScore >= 80) {
            assessment = "Strong Match";
        } else if (claimabilityScore >= 60) {
            assessment = "Moderate Match";
        } else if (claimabilityScore >= 40) {
            assessment = "Weak Match";
        } else {
            assessment = "Very Weak Match";
        }

const requiresManualReview =
    hasMatchedExclusion ||
    matchedSubLimits.length > 0 ||
    preExistingConditionsRules.length > 0 ||
    importantConditions.length > 0 ||
    roomRentPassed === null ||
    waiting.requiresManualReview;

if (
    requiresManualReview &&
    !hasBlockingIssues
) {
    assessment += " — Review Required";
}
        return res.json({
            claimCaseId: claimCase._id,
            policyName:
                policyData.policyName ||
                "Uploaded Policy",
                claimabilityScore,
                assessment,
                hasBlockingIssues,
                blockingIssues,
                requiresManualReview,
            analysis
        });

    } catch (error) {
        console.error("Analyze claim case failed");

        return res.status(500).json({
            message:
                "Failed to analyze claim case"
        });
    }
});

module.exports = router;