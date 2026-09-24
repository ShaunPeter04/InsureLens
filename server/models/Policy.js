const mongoose = require('mongoose');

// Subdocument: Structured Waiting Periods (in days/months for rule math)
const waitingPeriodsSchema = new mongoose.Schema(
  {
    initialDays: {
      type: Number,
      default: 30, // standard 30-day initial waiting period
      min: 0,
    },
    specificIllnessesMonths: {
      type: Number,
      default: 24, // commonly 24 months for named conditions
      min: 0,
    },
    preExistingDiseasesMonths: {
      type: Number,
      default: 36, // standard 36-48 months
      min: 0,
    },
    description: {
      type: String,
      trim: true,
    },
  },
  { _id: false }
);

// Subdocument: Room Rent Constraints
const roomRentLimitSchema = new mongoose.Schema(
  {
    hasCap: {
      type: Boolean,
      default: false,
    },
    percentageOfSumInsured: {
      type: Number,
      default: 0, // e.g., 1 for 1% of Sum Insured
      min: 0,
      max: 100,
    },
    maxPerDay: {
      type: Number,
      default: 0, // flat numeric limit in INR if applicable
      min: 0,
    },
    roomTypeAllowed: {
      type: String,
      enum: ['No Restriction', 'Single Private AC', 'Twin Sharing', 'General Ward'],
      default: 'No Restriction',
    },
  },
  { _id: false }
);

// Subdocument: Specific Treatment Sub-Limits
const subLimitSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      required: true,
      trim: true,
    },

    limitType: {
      type: String,
      enum: [
        'Fixed Amount',
        'Percentage of Sum Insured',
        'Up to Sum Insured',
        'Other'
      ],
      default: 'Fixed Amount',
    },

    limitAmount: {
      type: Number,
      min: 0,
      default: null,
    },

    limitPercentage: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },

    description: {
      type: String,
      trim: true,
    },
  },
  { _id: false }
);

// Main Policy Schema
const policySchema = new mongoose.Schema(
  {
    insuranceCompany: {
      type: String,
      required: [true, 'Insurance company name is required'],
      trim: true,
      index: true,
    },
    policyName: {
      type: String,
      required: [true, 'Policy name is required'],
      trim: true,
    },
    policyType: {
  type: [String],
  enum: ['Individual', 'Family Floater', 'Senior Citizen', 'Critical Illness'],
  default: ['Individual'],
},
    coverageAmounts: {
      type: [Number], // Available Sum Insured tiers: [300000, 500000, 1000000]
      required: true,
      validate: [
        (val) => val.length > 0,
        'At least one coverage amount must be specified',
      ],
    },
    basePremium: {
  type: Number,
  min: 0,
  default: null,
},
    eligibility: {
      minAge: {
        type: Number,
        default: 18,
        min: 0,
      },
      maxAge: {
        type: Number,
        default: 65,
        max: 120,
      },
      familyFloaterAllowed: {
        type: Boolean,
        default: true,
      },
    },
    waitingPeriods: {
      type: waitingPeriodsSchema,
      default: () => ({}),
    },
    preExistingConditionsRules: {
      type: [String], // e.g., ["Diabetes covered after 36 months", "Hypertension covered after 36 months"]
      default: [],
    },
    hospitalizationCoverage: {
      inpatientCovered: {
        type: Boolean,
        default: true,
      },
      minimumHospitalizationHours: {
        type: Number,
        default: 24, // standard 24 hours requirement
      },
      daycareTreatmentsCovered: {
        type: Boolean,
        default: true,
      },
      preHospitalizationDays: {
        type: Number,
        default: 30,
      },
      postHospitalizationDays: {
        type: Number,
        default: 60,
      },
    },
    roomRentLimit: {
      type: roomRentLimitSchema,
      default: () => ({}),
    },
    coPaymentPercentage: {
      type: Number,
      default: 0, // 0 = no co-pay, 10 = 10% co-pay
      min: 0,
      max: 100,
    },
    deductibleAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    subLimits: {
      type: [subLimitSchema],
      default: [],
    },
    majorExclusions: {
      type: [String], // e.g., ["Cosmetic surgery", "Self-inflicted injury", "Adventure sports"]
      default: [],
    },
    importantConditions: {
      type: [String], // e.g., ["Pre-auth required 48 hours prior for planned treatment", "Notify within 24h of emergency"]
      default: [],
    },
    documentUrl: {
      type: String,
      trim: true,
      default: null,
    },
    documentTextChunks: {
      type: [String], // Useful if caching chunked text for Vector Cosine Search / RAG
      default: [],
    },
    isActiveCatalogPlan: {
      type: Boolean,
      default: true, // Used to enable/disable plans in the general recommendation database
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for unique policy lookup under an insurer
policySchema.index({ insuranceCompany: 1, policyName: 1 });

module.exports = mongoose.model('Policy', policySchema);