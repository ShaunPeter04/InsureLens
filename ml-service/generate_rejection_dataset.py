
import csv
from pathlib import Path

DATA = {
    "Waiting Period": [
        "Claim denied because the initial waiting period has not ended",
        "Hospitalization occurred within the first thirty days of coverage",
        "Specific illness waiting period is still applicable",
        "The required waiting period for this treatment is incomplete",
        "Claim declined because the policy is too new",
        "Treatment falls under the disease specific waiting period",
        "Waiting period conditions have not been satisfied",
        "The insured has not completed the applicable waiting duration",
    ],
    "Pre-existing Disease": [
        "Claim rejected due to an undisclosed pre existing disease",
        "Medical records indicate a preexisting condition",
        "The insured failed to disclose an existing illness",
        "Rejection due to pre existing disease waiting requirements",
        "The proposal form did not mention the prior diagnosis",
        "Claim denied because of non disclosure of medical history",
        "Pre-existing medical condition was not declared",
        "The insurer identified an undeclared chronic illness",
    ],
    "Policy Exclusion": [
        "The claimed treatment is excluded from policy coverage",
        "Claim rejected under the policy exclusion clause",
        "The procedure is not covered by this insurance plan",
        "Treatment falls under a permanent exclusion",
        "The insurer does not cover the requested medical procedure",
        "Claim declined for an excluded medical expense",
        "This medical condition is outside the scope of coverage",
        "The treatment is listed as an excluded benefit",
    ],
    "Documentation": [
        "Claim rejected because required documents were not submitted",
        "The discharge summary is missing",
        "Incomplete medical records prevented claim processing",
        "The insurer requested additional hospital documents",
        "Original invoices were not provided",
        "Claim denied due to insufficient documentation",
        "Required diagnostic reports are missing",
        "The submitted claim form is incomplete",
    ],
    "Hospitalization": [
        "Hospitalization did not meet the minimum duration requirement",
        "Admission was not considered medically necessary",
        "Treatment was classified as outpatient care",
        "The patient was hospitalized for less than twenty four hours",
        "Claim denied because inpatient admission was unnecessary",
        "The treatment does not qualify as eligible day care",
        "Hospital admission requirements were not satisfied",
        "Medical necessity for hospitalization was not established",
    ],
    "Room Rent or Sub-limit": [
        "Room rent exceeded the permitted daily limit",
        "The selected room category was not eligible",
        "Claim amount exceeded the procedure sub limit",
        "Proportionate deduction applied due to higher room rent",
        "Hospital room charges exceeded policy allowance",
        "The treatment specific sublimit has been reached",
        "Room category restriction was violated",
        "The insurer applied a room rent related deduction",
    ],
    "Policy Validity": [
        "Claim rejected because the insurance policy had expired",
        "The policy was inactive on the admission date",
        "Premium was not paid before the due date",
        "Coverage had lapsed before hospitalization",
        "The insurance contract was not in force",
        "Claim denied because policy renewal was incomplete",
        "The insurer recorded a lapse in coverage",
        "The policy validity period had ended",
    ],
    "Financial Deduction": [
        "Claim reduced because of the applicable co payment",
        "The deductible amount was subtracted from the settlement",
        "Non payable medical expenses were deducted",
        "The policy requires the insured to share treatment costs",
        "The claim includes expenses not eligible for reimbursement",
        "Co payment percentage was applied to the eligible bill",
        "The settlement excludes non medical consumables",
        "The deductible threshold has not been met",
    ],
}

output = Path("datasets/rejection_reasons.csv")
output.parent.mkdir(parents=True, exist_ok=True)

with output.open("w", newline="", encoding="utf-8") as file:
    writer = csv.writer(file)
    writer.writerow(["rejection_reason", "category"])

    for category, reasons in DATA.items():
        for reason in reasons:
            writer.writerow([reason, category])

print(f"Dataset created: {output}")
print(f"Total examples: {sum(len(items) for items in DATA.values())}")
print(f"Categories: {len(DATA)}")
