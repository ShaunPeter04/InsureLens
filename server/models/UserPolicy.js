const mongoose = require("mongoose");

const userPolicySchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },

        policy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Policy",
            required: true
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