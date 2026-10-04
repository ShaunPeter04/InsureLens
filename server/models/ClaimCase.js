const mongoose = require("mongoose");

const claimCaseSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },

        userPolicy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "UserPolicy",
            required: true
        },

        patientType: {
            type: String,
            enum: ["Self", "Family Member"],
            required: true
        },

        familyMember: {
            type: mongoose.Schema.Types.ObjectId,
            default: null
        },

        hospitalName: {
            type: String,
            required: true,
            trim: true
        },

        hospitalizationType: {
            type: String,
            enum: [
                "Inpatient",
                "Day Care"
            ],
            required: true
        },

        admissionDate: {
            type: Date,
            required: true
        },

        admissionTime: {
            type: String,
            trim: true,
            default: ""
        },

        dischargeDate: {
            type: Date,
            required: true
        },

        dischargeTime: {
            type: String,
            trim: true,
            default: ""
        },

        diagnosis: {
            type: String,
            required: true,
            trim: true
        },

        treatment: {
            type: String,
            trim: true,
            default: ""
        },

        totalBillAmount: {
            type: Number,
            required: true,
            min: 0
        },

        roomRentPerDay: {
            type: Number,
            min: 0,
            default: 0
        },

        roomType: {
            type: String,
            trim: true,
            default: ""
        },

        isPlannedHospitalization: {
            type: Boolean,
            default: false
        },

        isEmergency: {
            type: Boolean,
            default: false
        },

        claimStatus: {
            type: String,
            enum: [
                "Not Submitted",
                "Submitted",
                "Approved",
                "Partially Approved",
                "Rejected"
            ],
            default: "Not Submitted"
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model(
    "ClaimCase",
    claimCaseSchema
);