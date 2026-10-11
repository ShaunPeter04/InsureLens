const mongoose = require("mongoose");

const rejectionCaseSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    userPolicy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserPolicy",
      required: true,
    },

    claimCase: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ClaimCase",
      default: null,
    },

    rejectionReason: {
      type: String,
      required: true,
      trim: true,
    },

    insurerRemarks: {
      type: String,
      trim: true,
      default: "",
    },

    rejectedAmount: {
      type: Number,
      min: 0,
      default: 0,
    },

    rejectionDate: {
      type: Date,
      default: null,
    },

    status: {
      type: String,
      enum: [
        "Under Analysis",
        "Recovery Suggested",
        "Resolved",
      ],
      default: "Under Analysis",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "RejectionCase",
  rejectionCaseSchema
);