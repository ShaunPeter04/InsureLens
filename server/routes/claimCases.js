const express = require("express");
const mongoose = require("mongoose");

const ClaimCase = require("../models/ClaimCase");
const UserPolicy = require("../models/UserPolicy");
const User = require("../models/User");
const auth = require("../middleware/auth");

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
                path: "userPolicy",
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
            "Get claim cases error:",
            error.message
        );

        return res.status(500).json({
            message: "Failed to load claim cases"
        });
    }
});

// ==================================================
// CREATE CLAIM CASE
// ==================================================

router.post("/", auth, async (req, res) => {
    try {
        const {
            userPolicy,
            patientType,
            familyMember,
            hospitalName,
            hospitalizationType,
            admissionDate,
            admissionTime,
            dischargeDate,
            dischargeTime,
            diagnosis,
            treatment,
            totalBillAmount,
            roomRentPerDay,
            roomType,
            isPlannedHospitalization,
            isEmergency
        } = req.body;

        // ------------------------------------------
        // BASIC REQUIRED FIELDS
        // ------------------------------------------

        if (
            !userPolicy ||
            !patientType ||
            !hospitalName?.trim() ||
            !hospitalizationType ||
            !admissionDate ||
            !dischargeDate ||
            !diagnosis?.trim()
        ) {
            return res.status(400).json({
                message:
                    "Please provide all required hospitalization details"
            });
        }

        // ------------------------------------------
        // VALIDATE USER POLICY ID
        // ------------------------------------------

        if (
            !mongoose.Types.ObjectId.isValid(userPolicy)
        ) {
            return res.status(400).json({
                message: "Invalid user policy ID"
            });
        }

        const savedPolicy = await UserPolicy.findOne({
            _id: userPolicy,
            user: req.user
        });

        if (!savedPolicy) {
            return res.status(404).json({
                message:
                    "Policy was not found in your account"
            });
        }

        // ------------------------------------------
        // PATIENT TYPE
        // ------------------------------------------

        if (
            !["Self", "Family Member"].includes(
                patientType
            )
        ) {
            return res.status(400).json({
                message: "Invalid patient type"
            });
        }

        let validatedFamilyMember = null;

        if (patientType === "Family Member") {
            if (
                !familyMember ||
                !mongoose.Types.ObjectId.isValid(
                    familyMember
                )
            ) {
                return res.status(400).json({
                    message:
                        "Please select a valid family member"
                });
            }

            const user = await User.findById(req.user);

            if (!user) {
                return res.status(404).json({
                    message: "User not found"
                });
            }

            const member =
                user.familyMembers.id(familyMember);

            if (!member) {
                return res.status(400).json({
                    message:
                        "Selected family member does not belong to your account"
                });
            }

            validatedFamilyMember = member._id;
        }

        // ------------------------------------------
        // DATES
        // ------------------------------------------

        const admission = new Date(admissionDate);
        const discharge = new Date(dischargeDate);

        if (
            Number.isNaN(admission.getTime()) ||
            Number.isNaN(discharge.getTime())
        ) {
            return res.status(400).json({
                message:
                    "Please provide valid hospitalization dates"
            });
        }

        if (discharge < admission) {
            return res.status(400).json({
                message:
                    "Discharge date cannot be before admission date"
            });
        }

        // ------------------------------------------
        // BILL AMOUNT
        // ------------------------------------------

        const billAmount = Number(totalBillAmount);

        if (
            !Number.isFinite(billAmount) ||
            billAmount < 0
        ) {
            return res.status(400).json({
                message:
                    "Please provide a valid bill amount"
            });
        }

        const roomRent = Number(
            roomRentPerDay || 0
        );

        if (
            !Number.isFinite(roomRent) ||
            roomRent < 0
        ) {
            return res.status(400).json({
                message:
                    "Please provide a valid room rent amount"
            });
        }

        // ------------------------------------------
        // CREATE CASE
        // ------------------------------------------

        const claimCase = await ClaimCase.create({
            user: req.user,
            userPolicy: savedPolicy._id,

            patientType,
            familyMember: validatedFamilyMember,

            hospitalName: hospitalName.trim(),
            hospitalizationType,

            admissionDate: admission,

            admissionTime:
                typeof admissionTime === "string"
                    ? admissionTime.trim()
                    : "",

            dischargeDate: discharge,

            dischargeTime:
                typeof dischargeTime === "string"
                    ? dischargeTime.trim()
                    : "",

            diagnosis: diagnosis.trim(),
            treatment:
                typeof treatment === "string"
                    ? treatment.trim()
                    : "",

            totalBillAmount: billAmount,
            roomRentPerDay: roomRent,

            roomType:
                typeof roomType === "string"
                    ? roomType.trim()
                    : "",

            isPlannedHospitalization:
                Boolean(isPlannedHospitalization),

            isEmergency:
                Boolean(isEmergency)
        });

        await claimCase.populate({
            path: "userPolicy",
            populate: {
                path: "policy"
            }
        });

        return res.status(201).json({
            message:
                "Hospitalization case created successfully",
            claimCase
        });

    } catch (error) {
        console.error(
            "Create claim case error:",
            error
        );

        return res.status(500).json({
            message:
                "Failed to create hospitalization case"
        });
    }
});

// ==================================================
// ANALYZE CLAIM CASE
// ==================================================

router.get("/:caseId/analyze", auth, async (req, res) => {
    try {
        if (
            !mongoose.Types.ObjectId.isValid(
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
            populate: {
                path: "policy"
            }
        });

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

        const admissionDate =
            new Date(claimCase.admissionDate);

        const policyStartDate =
            new Date(userPolicy.policyStartDate);

        const policyEndDate =
            new Date(userPolicy.policyEndDate);

        const policyActive =
            admissionDate.getTime() >=
                policyStartDate.getTime() &&
            admissionDate.getTime() <=
                policyEndDate.getTime();        

        const millisecondsPerDay =1000 * 60 * 60 * 24;

        const policyAgeDays = Math.floor(
            (
                admissionDate.getTime() -
                policyStartDate.getTime()
            ) / millisecondsPerDay
        );
        const initialWaitingDays =
            policyData.waitingPeriods
                ?.initialDays ?? 0;

        const initialWaitingSatisfied =
            initialWaitingDays === 0 ||
            policyAgeDays >= initialWaitingDays;

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
                claimCase.dischargeTime
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
            Number(claimCase.roomRentPerDay || 0);

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
                    actualRoomRent <= allowedRoomRent;

                roomRentReason = roomRentPassed
                    ? `Room rent of ₹${actualRoomRent.toLocaleString(
                        "en-IN"
                    )} per day is within the allowed limit of ₹${allowedRoomRent.toLocaleString(
                        "en-IN"
                    )} per day.`
                    : `Room rent of ₹${actualRoomRent.toLocaleString(
                        "en-IN"
                    )} per day exceeds the allowed limit of ₹${allowedRoomRent.toLocaleString(
                        "en-IN"
                    )} per day.`;
            } else {
                roomRentReason =
                    "A room-rent restriction is recorded, but no numeric room-rent limit is available.";
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

        const coPaymentPercentage =
            Number(
                policyData.coPaymentPercentage || 0
            );

        const estimatedCoPayment =
            amountWithinCoverage *
            (coPaymentPercentage / 100);

        const deductibleAmount =
            Number(
                policyData.deductibleAmount || 0
            );

        const estimatedDeductible = Math.min(
            deductibleAmount,
            amountWithinCoverage
        );

        const estimatedAmountAfterBasicDeductions =
            Math.max(
                0,
                amountWithinCoverage -
                    estimatedCoPayment -
                    estimatedDeductible
        );

        const pedWaitingMonths =
            Number(
                    policyData.waitingPeriods
                        ?.preExistingDiseasesMonths || 0
            );

        const hasPED =
            patientPreExistingDiseases.length > 0;

        const approximatePolicyAgeMonths =
            Math.floor(policyAgeDays / 30.44);

        // ------------------------------------------
        // DIAGNOSIS-AWARE PED MATCHING
        // ------------------------------------------

        const normalizePEDText = (value = "") =>
            value
                .toLowerCase()
                .replace(/[^a-z0-9\s]/g, " ")
                .replace(/\s+/g, " ")
                .trim();

        const normalizedPEDClaimText =
            normalizePEDText(
                `${claimCase.diagnosis || ""} ${claimCase.treatment || ""}`
            );

        const matchedPreExistingDiseases =
            patientPreExistingDiseases.filter((disease) => {
                const normalizedDisease =
                    normalizePEDText(disease);

                if (!normalizedDisease) {
                    return false;
                }

                return (
                    normalizedPEDClaimText.includes(
                        normalizedDisease
                    ) ||
                    normalizedDisease.includes(
                        normalizedPEDClaimText
                    )
                );
            });

        const pedApplies =
            matchedPreExistingDiseases.length > 0;

        const pedWaitingCompleted =
            pedWaitingMonths === 0 ||
            approximatePolicyAgeMonths >=
                pedWaitingMonths;

        const pedWaitingSatisfied =
            !pedApplies || pedWaitingCompleted;
            
        const specificIllnessWaitingMonths =
            Number(
                policyData.waitingPeriods
                    ?.specificIllnessesMonths || 0
            );

        const specificIllnessConditions =
            policyData.waitingPeriods
                ?.specificIllnessConditions || [];

        const specificIllnessWaitingCompleted =
            specificIllnessWaitingMonths === 0 ||
            approximatePolicyAgeMonths >=
                specificIllnessWaitingMonths;

        // ------------------------------------------
        // SPECIFIC ILLNESS / PROCEDURE MATCHING
        // ------------------------------------------

        const normalizeSpecificIllnessText = (value = "") =>
            value
                .toLowerCase()
                .replace(/[^a-z0-9\s]/g, " ")
                .replace(/\s+/g, " ")
                .trim();

        const normalizedClaimText =
            normalizeSpecificIllnessText(
                `${claimCase.diagnosis || ""} ${claimCase.treatment || ""}`
            );

        const matchedSpecificIllnessConditions =
            specificIllnessConditions.filter((condition) => {
                const normalizedCondition =
                    normalizeSpecificIllnessText(condition);

                if (!normalizedCondition) {
                    return false;
                }

                return (
                    normalizedClaimText.includes(normalizedCondition) ||
                    normalizedCondition.includes(normalizedClaimText)
                );
            });

        const specificIllnessApplies =
            matchedSpecificIllnessConditions.length > 0;

        const specificIllnessWaitingSatisfied =
            !specificIllnessApplies ||
            specificIllnessWaitingCompleted;
        

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

        // Specific illness waiting-period blocker
        if (
            specificIllnessApplies &&
            !specificIllnessWaitingCompleted
        ) {
            blockingIssues.push(
                `The ${specificIllnessWaitingMonths}-month specific illness waiting period has not been completed for: ${matchedSpecificIllnessConditions.join(", ")}.`
            );
        }

        // PED waiting-period blocker
        if (
            pedApplies &&
            !pedWaitingCompleted
        ) {
            blockingIssues.push(
                `The ${pedWaitingMonths}-month pre-existing disease waiting period has not been completed for: ${matchedPreExistingDiseases.join(", ")}.`
            );
        }

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

                message: policyActive
                    ? "Policy was active on the admission date."
                    : "Policy was not active on the admission date."
            },

            initialWaitingPeriod: {
                passed: initialWaitingSatisfied,

                policyAgeDays,
                requiredDays: initialWaitingDays,

                message: initialWaitingSatisfied
                    ? `Initial waiting period of ${initialWaitingDays} days was completed.`
                    : `Initial waiting period of ${initialWaitingDays} days was not completed. Policy was only ${policyAgeDays} days old on admission.`
            },
        pedWaitingPeriod: {
            passed: pedWaitingSatisfied,

            applicable: pedApplies,

            patientPreExistingDiseases,

            matchedPreExistingDiseases,

            requiredMonths: pedWaitingMonths,

            approximatePolicyAgeMonths,

            completed: pedWaitingCompleted,

            message:
                !hasPED
                    ? "No pre-existing diseases are recorded for this patient."
                    : !pedApplies
                        ? "The current diagnosis/treatment does not directly match the patient's recorded pre-existing diseases."
                        : pedWaitingCompleted
                            ? `The current diagnosis/treatment matches a recorded pre-existing disease, but the ${pedWaitingMonths}-month PED waiting period has been completed.`
                            : `The current diagnosis/treatment matches a recorded pre-existing disease, and the ${pedWaitingMonths}-month PED waiting period has not been completed.`
        },   
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
                        : !minimumHoursSatisfied
                            ? `Hospitalization duration was ${hospitalizationHours?.toFixed(1)} hours, below the required ${requiredHospitalizationHours} hours.`
                            : claimCase.hospitalizationType ===
                                "Day Care"
                                ? "Day-care treatment is covered under this policy."
                                : `Hospitalization duration was ${hospitalizationHours?.toFixed(1)} hours and satisfies the ${requiredHospitalizationHours}-hour requirement.`
            },
            roomRent: {
                passed:
                    roomRentPassed &&
                    roomTypePassed,

                actualPerDay: actualRoomRent,

                allowedPerDay: allowedRoomRent,

                actualRoomType:
                    claimCase.roomType || null,

                allowedRoomType,

                message:
                    !roomRentPassed
                        ? roomRentReason
                        : !roomTypePassed
                            ? `Selected room type "${claimCase.roomType}" does not match the policy room eligibility "${allowedRoomType}".`
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
                coPaymentPercentage,
                estimatedCoPayment,

                deductibleAmount,
                estimatedDeductible,

                estimatedAmountAfterBasicDeductions,

                message:
                    coPaymentPercentage > 0 ||
                    deductibleAmount > 0
                        ? "Co-payment and/or deductible may reduce the payable amount."
                        : "No structured co-payment or deductible applies under the stored policy rules."
            },
            requiresReview: {
                specificIllnessWaitingPeriod: {
                    requiredMonths:
                        specificIllnessWaitingMonths,

                    completed:
                        specificIllnessWaitingCompleted,

                    applicable:
                        specificIllnessApplies,

                    passed:
                        specificIllnessWaitingSatisfied,

                    matchedConditions:
                        matchedSpecificIllnessConditions,

                    message:
                        !specificIllnessApplies
                            ? "The current diagnosis/treatment does not directly match any stored condition in the specific-illness waiting-period list."
                            : specificIllnessWaitingCompleted
                                ? `The current diagnosis/treatment matches the specific-illness waiting-period list, but the ${specificIllnessWaitingMonths}-month waiting period has already been completed.`
                                : `The current diagnosis/treatment matches the specific-illness waiting-period list, and the ${specificIllnessWaitingMonths}-month waiting period has not yet been completed.`
                },

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
        maximumScore += 15;

        if (roomRentPassed && roomTypePassed) {
            claimabilityScore += 15;
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

        console.log("MANUAL REVIEW DEBUG", {
            hasMatchedExclusion,
            matchedExclusions,
            matchedSubLimits,
            preExistingConditionsRules,
            importantConditions
        });

const requiresManualReview =
    hasMatchedExclusion ||
    matchedSubLimits.length > 0 ||
    preExistingConditionsRules.length > 0 ||
    importantConditions.length > 0;

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
        console.error(
            "Analyze claim case error:",
            error
        );

        return res.status(500).json({
            message:
                "Failed to analyze claim case"
        });
    }
});

module.exports = router;