const { extractionReview } = require("./uploadedPolicyReview");

const normalize = (value = "") =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const {
  analyzeWaitingPeriods
} = require("./waitingPeriodAnalyzer");

const RULES = [
  {
    category: "Waiting Period",
    keywords: [
      "waiting period",
      "initial waiting",
      "specific disease waiting",
      "policy too new"
    ],
    explanation:
      "The insurer may have rejected the claim because a policy waiting period was not completed.",
    actions: [
      "Check the policy commencement date and applicable waiting-period clause.",
      "Compare the admission date with the waiting-period end date.",
      "If the waiting period was completed or an exception applies, request reconsideration with supporting documents."
    ]
  },
  {
    category: "Pre-existing Disease",
    keywords: [
      "pre existing",
      "preexisting",
      "ped",
      "undeclared disease",
      "non disclosure"
    ],
    explanation:
      "The rejection may relate to a pre-existing condition, disclosure, or its applicable waiting period.",
    actions: [
      "Review the pre-existing disease clause and proposal-form disclosures.",
      "Collect relevant medical history and supporting records.",
      "Request the insurer's specific evidence and policy clause supporting the rejection."
    ]
  },
  {
    category: "Policy Exclusion",
    keywords: [
      "exclusion",
      "excluded",
      "not covered",
      "non covered treatment"
    ],
    explanation:
      "The insurer may consider the treatment excluded under the policy.",
    actions: [
      "Request the exact exclusion clause cited by the insurer.",
      "Compare the diagnosis and treatment with the policy wording.",
      "Submit medical clarification if the exclusion was applied incorrectly."
    ]
  },
  {
    category: "Documentation",
    keywords: [
      "missing document",
      "insufficient document",
      "document not submitted",
      "incomplete documents",
      "missing records",
      "deficiency",
    "documentation",
    "hospital indoor case papers",
    "indoor case papers",
    "case papers",
    "incomplete hospital records",
    "missing hospital records",
    "hospital records",
    "deficient documents",
    "document deficiency"
    ],
    explanation:
      "The insurer may require additional claim documents.",
    actions: [
      "Request a complete list of missing documents.",
      "Collect discharge summaries, bills, prescriptions, and investigation reports as applicable.",
      "Resubmit the documents and obtain an acknowledgement."
    ]
  },
  {
    category: "Hospitalization",
    keywords: [
      "24 hours",
      "hospitalization duration",
      "not medically necessary",
      "medical necessity",
      "outpatient"
    ],
    explanation:
      "The rejection may concern hospitalization duration, treatment eligibility, or medical necessity.",
    actions: [
      "Check the inpatient and day-care eligibility provisions.",
      "Obtain a treating doctor's explanation of medical necessity.",
      "Request reconsideration if the treatment qualifies under the policy."
    ]
  },
  {
    category: "Room Rent or Sub-limit",
    keywords: [
      "room rent",
      "room category",
      "sub limit",
      "sublimit",
      "proportionate deduction"
    ],
    explanation:
      "The insurer may have applied a room-rent restriction or treatment-specific sub-limit.",
    actions: [
      "Verify the applicable room-rent and sub-limit clauses.",
      "Compare the permitted amount with the hospital invoice.",
      "Request a detailed deduction calculation and challenge any incorrect application."
    ]
  },
  {
    category: "Policy Validity",
    keywords: [
    "policy expired",
    "policy had expired",
    "insurance policy expired",
    "policy was not active",
    "policy not active",
    "policy inactive",
    "inactive policy",
    "lapsed policy",
    "policy lapsed",
    "premium unpaid",
    "premium not paid",
    "premium was not paid",
    "renewal premium was not paid",
    "renewal premium not paid",
    "non renewal",
    "not renewed",
    "not in force",
    "coverage expired",
    "coverage terminated"
    ],
    explanation:
      "The insurer may consider the policy inactive on the treatment date.",
    actions: [
      "Verify the policy period and premium payment receipts.",
      "Check renewal, grace-period, and continuity provisions.",
      "Provide proof of valid coverage if the rejection is incorrect."
    ]
  },
  {
    category: "Financial Deduction",
    keywords: [
      "co payment",
      "copayment",
      "co pay",
      "deductible",
      "non payable",
      "non medical expenses"
    ],
    explanation:
      "The disputed amount may relate to contractual cost-sharing or non-payable expenses.",
    actions: [
      "Request an itemized settlement and deduction statement.",
      "Check co-payment, deductible, and non-payable expense clauses.",
      "Dispute any deductions inconsistent with the policy wording."
    ]
  }
];

function analyzeRejection(rejectionCase, policyData, userPolicy, claimCase,) {

    const detailedWaitingPeriodAnalysis = analyzeWaitingPeriods(
    policyData,
    userPolicy,
    claimCase
    );



    const rejectionText = normalize(
    `${rejectionCase.rejectionReason || ""} ${rejectionCase.insurerRemarks || ""}`
    );

    const initialWaitingApplicable =
    rejectionText.includes("waiting period") ||
    rejectionText.includes("initial waiting") ||
    rejectionText.includes("first 30 days") ||
    rejectionText.includes("30 day waiting") ||
    rejectionText.includes("policy too new");

    const initialResult = detailedWaitingPeriodAnalysis.initial;

    const waitingPeriodVerification = {
      applicable: initialWaitingApplicable,
      verified: ["Waiting Period Completed", "Waiting Period Not Completed"].includes(initialResult.status),
      status: initialResult.status,
      waitingEndDate: initialResult.waitingEndDate,
      requiresManualReview: true,
      message: initialResult.message
    };

    const text = rejectionText;
    const matches = RULES.map((rule) => ({
        rule,
        matchedKeywords: rule.keywords.filter((keyword) =>
        text.includes(normalize(keyword))
        )
    })).filter((entry) => entry.matchedKeywords.length > 0);

    const filteredMatches = matches.filter((entry) => {
        if (
        entry.rule.category === "Policy Exclusion" &&
        matches.some(
            (match) => match.rule.category === "Financial Deduction"
        )
        ) {
        const hasExplicitTreatmentExclusion =
            /\b(treatment|procedure|disease|condition)\b.{0,60}\b(excluded|exclusion|not covered)\b/.test(text) ||
            /\b(excluded|exclusion|not covered)\b.{0,60}\b(treatment|procedure|disease|condition)\b/.test(text);

        return hasExplicitTreatmentExclusion;
        }

        return true;
    });

    const categories = filteredMatches.map(
        (entry) => entry.rule.category
    );

    const classificationConfidence =
        filteredMatches.length === 0
            ? "Unclassified"
            : filteredMatches.length === 1
            ? "Keyword Match"
            : "Multiple Possible Categories";
    
    const evidenceStatus =
    waitingPeriodVerification.applicable
        ? waitingPeriodVerification.verified
        ? "Partially Verified"
        : "Insufficient Information"
        : "Not Independently Verified";

    const initialWaitingReason =
    /\binitial waiting\b|\bfirst 30 days\b|\b30 day waiting\b|\bpolicy too new\b/.test(text);

    const otherWaitingReason =
    /\bspecific (?:disease|illness)\b|\bpre existing\b|\bpreexisting\b|\bped\b|\bdisease specific\b/.test(text);

    const recoveryAssessment =
    initialWaitingReason &&
    !otherWaitingReason &&
    waitingPeriodVerification.status === "Waiting Period Completed"
        ? "Initial Waiting Period Appears Completed — Review Rejection"
        : initialWaitingReason &&
            !otherWaitingReason &&
            waitingPeriodVerification.status === "Waiting Period Not Completed"
        ? "Initial Waiting Period Not Completed — Review Exceptions"
        : "Further Evidence Required — Manual Review";

    const recoveryActions = [
    ...new Set([
        ...filteredMatches.flatMap((entry) => entry.rule.actions),
        ...(waitingPeriodVerification.status === "Waiting Period Completed"
        ? [
            "Ask the insurer to identify the exact waiting-period clause used for rejection.",
            "Provide policy commencement and hospitalization dates for reconsideration.",
            "Verify whether a specific-illness or pre-existing-disease waiting period applies before disputing the rejection."
            ]
        : []),

        ...(waitingPeriodVerification.status === "Waiting Period Not Completed"
        ? [
            "Check whether an accident-related or other contractual waiting-period exception applies.",
            "Review any applicable continuity benefits from previous insurance coverage."
            ]
        : []),

        "Keep copies of the rejection letter, claim documents, correspondence, and insurer responses."
    ])
    ];
    const policyClausesToReview = [];

    if (
        categories.includes("Waiting Period") ||
        categories.includes("Pre-existing Disease")
    ) {
        policyClausesToReview.push({
        field: "waitingPeriods",
        value: policyData?.waitingPeriods ?? null
        });
    }

    if (categories.includes("Pre-existing Disease")) {
        policyClausesToReview.push({
        field: "preExistingConditionsRules",
        value: policyData?.preExistingConditionsRules ?? []
        });
    }

    if (categories.includes("Policy Exclusion")) {
        policyClausesToReview.push({
        field: "majorExclusions",
        value: policyData?.majorExclusions ?? []
        });
    }

    if (categories.includes("Hospitalization")) {
        policyClausesToReview.push({
        field: "hospitalizationCoverage",
        value: policyData?.hospitalizationCoverage ?? null
        });
    }

    if (categories.includes("Room Rent or Sub-limit")) {
        policyClausesToReview.push(
        {
            field: "roomRentLimit",
            value: policyData?.roomRentLimit ?? null
        },
        {
            field: "subLimits",
            value: policyData?.subLimits ?? []
        }
        );
    }

    if (categories.includes("Financial Deduction")) {
        policyClausesToReview.push(
        {
            field: "coPaymentPercentage",
            value: policyData?.coPaymentPercentage ?? null
        },
        {
            field: "deductibleAmount",
            value: policyData?.deductibleAmount ?? null
        }
        );
    }

  return {
    ...(userPolicy?.sourceType === "Uploaded" ? {extractionReview:extractionReview(userPolicy)} : {}),
    classificationMethod: "Rule-based keyword matching",
    classificationConfidence,
    detailedWaitingPeriodAnalysis,
    evidenceStatus,
    recoveryAssessment,
    categories:
      categories.length > 0
        ? categories
        : ["Unclassified"],
        matchedKeywords: filteredMatches.flatMap(
        (entry) => entry.matchedKeywords
        ),
    explanations:
    filteredMatches.length > 0
        ? filteredMatches.map((entry) => entry.rule.explanation)
        : [
            "The supplied rejection reason could not be classified automatically."
      ],
    policyClausesToReview: userPolicy?.sourceType === "Uploaded" ? [{field:"Uploaded policy terms",value:"Unverified. Review the original policy; absent clauses do not mean no exclusions, sub-limits or deductions apply."}] : policyClausesToReview,
    recoveryActions:
      recoveryActions.length > 0
        ? recoveryActions
        : [
            "Request the insurer's written rejection explanation and exact policy clause.",
            "Collect supporting medical and claim documents.",
            "Seek manual review before deciding whether to challenge the rejection."
          ],
    requiresManualReview: true,
    disclaimer:
      "This analysis provides possible recovery steps, not a guarantee of claim approval or reversal.",
    waitingPeriodVerification
  };
}


module.exports = { analyzeRejection };
