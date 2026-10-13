const mongoose = require("mongoose");

const userPolicySchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },

        // Where this user policy came from
        sourceType: {
            type: String,
            enum: ["Catalog", "Uploaded"],
            default: "Catalog",
            required: true
        },

        // Used when sourceType = Catalog
        policy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Policy",
            default: null
        },

        selectedCoverage: {
            type: Number,
            required: true,
            min: 1
        },

        policyNumber: {
            type: String,
            trim: true,
            default: ""
        },

        policyStartDate: {
            type: Date,
            required: true
        },

        policyEndDate: {
            type: Date,
            required: true
        },

        status: {
            type: String,
            enum: [
                "Active",
                "Expired"
            ],
            default: "Active"
        },

        // Used when sourceType = Uploaded
        uploadedDocument: {
            originalName: {
                type: String,
                trim: true,
                default: ""
            },

            fileName: {
                type: String,
                trim: true,
                default: ""
            },

            filePath: {
                type: String,
                trim: true,
                default: ""
            },

            mimeType: {
                type: String,
                trim: true,
                default: ""
            },

            fileSize: {
                type: Number,
                min: 0,
                default: 0
            },

            extractedText: {
                type: String,
                default: ""
            },

            extractionMethod: {
                type: String,
                enum: [
                    "Not Processed",
                    "PDF Text",
                    "OCR"
                ],
                default: "Not Processed"
            }
        },

        // Structured information extracted from uploaded PDF
        extractedPolicyData: {
            insuranceCompany: {
                type: String,
                trim: true,
                default: ""
            },

            policyName: {
                type: String,
                trim: true,
                default: ""
            },

            waitingPeriods: {
                initialDays: {
                    type: Number,
                    min: 0,
                    default: 0
                },

                specificIllnessesMonths: {
                    type: Number,
                    min: 0,
                    default: 0
                },

                specificIllnessConditions: {
                    type: [String],
                    default: []
                },

                preExistingDiseasesMonths: {
                    type: Number,
                    min: 0,
                    default: 0
                }
            },

            hospitalizationCoverage: {
                inpatientCovered: {
                    type: Boolean,
                    default: true
                },

                minimumHospitalizationHours: {
                    type: Number,
                    min: 0,
                    default: 24
                },

                daycareTreatmentsCovered: {
                    type: Boolean,
                    default: false
                }
            },

            roomRentLimit: {
                hasCap: {
                    type: Boolean,
                    default: false
                },

                percentageOfSumInsured: {
                    type: Number,
                    min: 0,
                    max: 100,
                    default: 0
                },

                maxPerDay: {
                    type: Number,
                    min: 0,
                    default: 0
                },

                roomTypeAllowed: {
                    type: String,
                    trim: true,
                    default: "No Restriction"
                }
            },

            coPaymentPercentage: {
                type: Number,
                min: 0,
                max: 100,
                default: 0
            },

            deductibleAmount: {
                type: Number,
                min: 0,
                default: 0
            },

            preExistingConditionsRules: {
                type: [String],
                default: []
            },

            majorExclusions: {
                type: [String],
                default: []
            },

            subLimits: {
                type: [mongoose.Schema.Types.Mixed],
                default: []
            },

            importantConditions: {
                type: [String],
                default: []
            }
        }
    },
    {
        timestamps: true
    }
);

userPolicySchema.index(
    {
        user: 1,
        policyNumber: 1
    },
    {
        unique: true,
        partialFilterExpression: {
            policyNumber: {
                $type: "string",
                $gt: ""
            }
        }
    }
);

module.exports = mongoose.model(
    "UserPolicy",
    userPolicySchema
);