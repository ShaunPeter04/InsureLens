const express = require("express");
const axios = require("axios");
const { validateRecommendation, validRecommendationResults, diseases } = require("../utils/recommendationValidation");
const { profileAge, validatePolicyTerms } = require("../utils/analysisValidation");
const { isValidId, money } = require("../utils/insuranceValidation");

const Policy = require("../models/Policy");
const User = require("../models/User");
const auth = require("../middleware/auth");

const router = express.Router();

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

const calculateAge = profileAge;

const mergeDiseases = (...diseaseLists) => {
    const diseaseMap = new Map();

    diseaseLists
        .flat()
        .filter(Boolean)
        .forEach((disease) => {
            const cleaned =
                String(disease).trim();

            if (!cleaned) return;

            const key =
                cleaned.toLowerCase();

            if (!diseaseMap.has(key)) {
                diseaseMap.set(
                    key,
                    cleaned
                );
            }
        });

    return Array.from(
        diseaseMap.values()
    );
};

// --------------------------------------------------
// RECOMMENDATIONS
// POST /api/recommendations
// --------------------------------------------------

router.post("/", auth, async (req, res) => {
    try {
        const { error: validationError, data } = validateRecommendation(req.body);
        if (validationError) return res.status(400).json({ message: validationError });
        const user =
            await User.findById(
                req.user
            ).lean();

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        // --------------------------------------------------
        // BASIC INPUT VALIDATION
        // --------------------------------------------------

        const { requiredCoverage, coverageType } = data;
        if (!["male", "female", "other"].includes(user.gender) || money(user.annualIncome) === null || typeof user.city !== "string" || !user.city.trim()) {
            return res.status(400).json({ message: "Please complete valid gender, city and annual income details in your profile" });
        }

        // --------------------------------------------------
        // SELF AGE
        // --------------------------------------------------

        const selfAge =
            calculateAge(
                user.dateOfBirth
            );        
    // --------------------------------------------------
        // BUILD INSURED PEOPLE
        // --------------------------------------------------

        const insuredMembers = [];

        /*
         * Individual:
         * Self is always the insured person.
         *
         * Family Floater:
         * Self is included only when
         * includeSelf === true.
         */

        const includeSelf =
            coverageType === "Individual"
                ? true
                : data.includeSelf ===
                  true;
        if (includeSelf && selfAge === null) {
            return res.status(400).json({
                message:
                    "Please provide a valid date of birth in your profile"
            });
        }

        if (includeSelf) {
            insuredMembers.push({
                memberType: "Self",

                name:
                    `${user.firstname || ""} ${
                        user.lastname || ""
                    }`.trim(),

                relationship: "Self",

                age: selfAge,

                gender:
                    user.gender || "",

                preExistingDiseases:
                    Array.isArray(
                        data
                            .preExistingDiseases
                    )
                        ? data
                              .preExistingDiseases
                        : []
            });
        }

        // --------------------------------------------------
        // FAMILY FLOATER MEMBERS
        // --------------------------------------------------

        if (
            coverageType ===
            "Family Floater"
        ) {
            const selectedFamilyMembers =
                data
                    .selectedFamilyMembers ||
                [];

            if (
                !Array.isArray(
                    selectedFamilyMembers
                )
            ) {
                return res
                    .status(400)
                    .json({
                        message:
                            "Selected family members must be an array"
                    });
            }

            // Remove duplicate IDs
            const uniqueMemberIds = [
                ...new Set(
                    selectedFamilyMembers.map(
                        (id) =>
                            String(id)
                    )
                )
            ];

            // Validate MongoDB IDs
            const invalidId =
                uniqueMemberIds.find(
                    (id) =>
                        !isValidId(
                            id
                        )
                );

            if (invalidId) {
                return res
                    .status(400)
                    .json({
                        message:
                            "Invalid family member ID"
                    });
            }

            const savedFamilyMembers =
                Array.isArray(user.familyMembers) ? user.familyMembers : [];

            /*
             * Important security check:
             * Only family members belonging
             * to the authenticated user
             * can be selected.
             */
            const selectedMembers =
                savedFamilyMembers.filter(
                    (member) =>
                        uniqueMemberIds.includes(
                            String(
                                member._id
                            )
                        )
                );

            if (
                selectedMembers.length !==
                uniqueMemberIds.length
            ) {
                return res
                    .status(400)
                    .json({
                        message:
                            "One or more selected family members are invalid"
                    });
            }

            // Add selected family members
            for (
                const member of
                selectedMembers
            ) {
                const memberAge =
                    calculateAge(
                        member.dateOfBirth
                    );

                if (
                    memberAge === null || !["male", "female", "other"].includes(typeof member.gender === "string" ? member.gender.toLowerCase() : "") || !diseases(member.preExistingDiseases)
                ) {
                    return res
                        .status(400)
                        .json({
                            message:
                                "Please update the selected family member’s date of birth, gender or disease details"
                        });
                }

                insuredMembers.push({
                    memberId:
                        String(
                            member._id
                        ),

                    memberType:
                        "FamilyMember",

                    name:
                        member.name,

                    relationship:
                        member.relationship,

                    age:
                        memberAge,

                    gender:
                        member.gender ||
                        "",

                    isDependent:
                        member.isDependent,

                    preExistingDiseases:
                        member.preExistingDiseases ||
                        []
                });
            }

            // --------------------------------------------------
            // REQUIRE AT LEAST 2 PEOPLE
            // --------------------------------------------------

            if (
                insuredMembers.length <
                2
            ) {
                return res
                    .status(400)
                    .json({
                        message:
                            "Please select at least 2 people for a Family Floater policy"
                    });
            }
        }

        // --------------------------------------------------
        // SAFETY CHECK
        // --------------------------------------------------

        if (
            insuredMembers.length === 0
        ) {
            return res
                .status(400)
                .json({
                    message:
                        "Please select at least one person to insure"
                });
        }

        // --------------------------------------------------
        // AGE USED BY CURRENT V1 ALGORITHM
        // --------------------------------------------------

        // Keep the legacy scalar age for API compatibility. Family matching uses
        // every server-derived insured member below rather than this maximum.
        const recommendationAge =
            Math.max(
                ...insuredMembers.map(
                    (member) =>
                        member.age
                )
            );

        // --------------------------------------------------
        // COMBINE PEDs
        // --------------------------------------------------

        /*
         * Only PEDs belonging to people
         * actually selected for insurance
         * are included.
         */

        const combinedDiseases =
            mergeDiseases(
                ...insuredMembers.map(
                    (member) =>
                        member.preExistingDiseases ||
                        []
                )
            );

        // --------------------------------------------------
        // FASTAPI REQUIREMENTS
        // --------------------------------------------------

        const userRequirements = {
            requiredCoverage,

            coverageType,

            budget:
                data.budget ??
                null,

            preExistingDiseases:
                combinedDiseases,

            isSmokerOrTobaccoUser:
                Boolean(
                    data
                        .isSmokerOrTobaccoUser
                ),

            alcoholConsumption:
                data
                    .alcoholConsumption ||
                "Never",

            hasHighRiskOccupation:
                Boolean(
                    data
                        .hasHighRiskOccupation
                ),

            coPaymentPreference:
                data
                    .coPaymentPreference ??
                0,

            roomRentPreference:
                data
                    .roomRentPreference ||
                "No Restriction",

            insuredMembers: insuredMembers.map(member => ({
                memberType: member.memberType,
                relationship: member.relationship || null,
                age: member.age,
                ...(typeof member.isDependent === "boolean" ? { isDependent: member.isDependent } : {})
            })),

            // Retained for older clients and individual coverage.
            age:
                recommendationAge,

            /*
             * These fields are still
             * required by the current
             * FastAPI model.
             *
             * They are not currently
             * part of scoring.
             */
            gender:
                user.gender || "",

            city:
                user.city || "",

            annualIncome:
                Number(user.annualIncome)
        };

        // --------------------------------------------------
        // POLICIES
        // --------------------------------------------------

        const catalogPolicies =
            await Policy.find({
                isActiveCatalogPlan:
                    true
            }).lean();

        const policies = catalogPolicies.filter(policy => !validatePolicyTerms(policy, { recommendation: true }));
        if (catalogPolicies.length > 0 && policies.length === 0) {
            return res.status(503).json({ message: "Policy information is incomplete. Please try again later." });
        }
        if (
            policies.length === 0
        ) {
            return res.json({
                recommendations: []
            });
        }

        // --------------------------------------------------
        // ML SERVICE
        // --------------------------------------------------

        const mlServiceUrl =
            process.env.ML_SERVICE_URL
                ?.trim()
                .replace(/\/+$/, "");

        if (!mlServiceUrl) {
            return res
                .status(500)
                .json({
                    message:
                        "ML service URL is not configured"
                });
        }

        const mlUrl =
            `${mlServiceUrl}/recommend`;

        const mlResponse =
            await axios.post(
                mlUrl,
                {
                    userRequirements,
                    policies
                },
                {
                    timeout: 10000
                }
            );
        // --------------------------------------------------
        // RESPONSE
        // --------------------------------------------------

        if (!validRecommendationResults(mlResponse.data?.recommendations) || mlResponse.data.recommendations.some(item => !policies.some(policy => String(policy._id) === item.policyId))) {
            return res.status(502).json({ message: "Recommendation service returned incomplete results. Please try again." });
        }
        return res.json(mlResponse.data);

    } catch (error) {
    // ML service timed out
    if (error.code === "ECONNABORTED") {
        return res.status(504).json({
            message:
                "Recommendation service took too long to respond. Please try again."
        });
    }

    // ML service is unavailable
    if (
        error.code === "ECONNREFUSED" ||
        error.code === "ENOTFOUND"
    ) {
        return res.status(503).json({
            message:
                "Recommendation service is temporarily unavailable. Please try again later."
        });
    }

    // ML service returned an error response
    if (error.response) {
        return res.status(502).json({
            message:
                "Recommendation service could not process the request."
        });
    }

    // Other backend errors
    return res.status(500).json({
        message:
            "Failed to generate recommendations."
    });
    }
}); 

module.exports = router;