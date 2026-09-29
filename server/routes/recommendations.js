const express = require("express");
const axios = require("axios");
const mongoose = require("mongoose");

const Policy = require("../models/Policy");
const User = require("../models/User");
const auth = require("../middleware/auth");

const router = express.Router();

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

const calculateAge = (dateOfBirth) => {
    if (!dateOfBirth) return null;

    const today = new Date();
    const birthDate = new Date(dateOfBirth);

    if (
        isNaN(birthDate.getTime()) ||
        birthDate > today
    ) {
        return null;
    }

    let age =
        today.getFullYear() -
        birthDate.getFullYear();

    const monthDifference =
        today.getMonth() -
        birthDate.getMonth();

    if (
        monthDifference < 0 ||
        (
            monthDifference === 0 &&
            today.getDate() <
                birthDate.getDate()
        )
    ) {
        age--;
    }

    return age;
};

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

        const requiredCoverage =
            Number(
                req.body.requiredCoverage
            );

        if (
            !Number.isFinite(
                requiredCoverage
            ) ||
            requiredCoverage <= 0
        ) {
            return res.status(400).json({
                message:
                    "Please provide a valid required coverage amount"
            });
        }

        const coverageType =
            req.body.coverageType;

        if (
            coverageType !==
                "Individual" &&
            coverageType !==
                "Family Floater"
        ) {
            return res.status(400).json({
                message:
                    "Invalid coverage type"
            });
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
                : req.body.includeSelf ===
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
                        req.body
                            .preExistingDiseases
                    )
                        ? req.body
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
                req.body
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
                        !mongoose.Types.ObjectId.isValid(
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
                user.familyMembers || [];

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
                    memberAge === null
                ) {
                    return res
                        .status(400)
                        .json({
                            message:
                                `Invalid date of birth for ${member.name}`
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

        /*
         * Current FastAPI schema accepts
         * one age only.
         *
         * For Family Floater V1 we use
         * the eldest selected insured
         * person's age.
         */

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
                req.body.budget ??
                null,

            preExistingDiseases:
                combinedDiseases,

            isSmokerOrTobaccoUser:
                Boolean(
                    req.body
                        .isSmokerOrTobaccoUser
                ),

            alcoholConsumption:
                req.body
                    .alcoholConsumption ||
                "Never",

            hasHighRiskOccupation:
                Boolean(
                    req.body
                        .hasHighRiskOccupation
                ),

            coPaymentPreference:
                req.body
                    .coPaymentPreference ??
                0,

            roomRentPreference:
                req.body
                    .roomRentPreference ||
                "No Restriction",

            /*
             * Current V1:
             * eldest selected insured
             */
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
                user.annualIncome ??
                null
        };

        // --------------------------------------------------
        // POLICIES
        // --------------------------------------------------

        const policies =
            await Policy.find({
                isActiveCatalogPlan:
                    true
            }).lean();

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

        return res.json(
            mlResponse.data
        );

    } catch (error) {
    console.error(
        "Recommendation error:",
        error.response?.data || error.message
    );

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