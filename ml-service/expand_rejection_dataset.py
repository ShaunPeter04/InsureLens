
import csv
import random
from pathlib import Path

import pandas as pd

random.seed(42)

DATA = {
    "Waiting Period": {
        "reasons": [
            "initial waiting period is incomplete",
            "specific illness waiting period has not ended",
            "mandatory waiting duration has not been satisfied",
            "coverage waiting requirement remains applicable",
            "disease specific waiting restriction applies"
        ],
        "prefixes": [
            "The insurer rejected the claim because",
            "The claim was declined as",
            "The settlement request was denied because",
            "According to the rejection letter,",
            "The claim could not be approved because"
        ]
    },
    "Pre-existing Disease": {
        "reasons": [
            "a pre-existing medical condition was not disclosed",
            "the proposal form omitted previous medical history",
            "the insured had an undeclared illness",
            "a prior diagnosis was not reported",
            "pre-existing disease disclosure requirements were not satisfied"
        ],
        "prefixes": [
            "The insurer rejected the claim because",
            "The claim was declined as",
            "Medical records indicate that",
            "The rejection notice states that",
            "The claim could not be approved because"
        ]
    },
    "Policy Exclusion": {
        "reasons": [
            "the treatment falls under a policy exclusion",
            "the requested procedure is excluded from coverage",
            "the medical expense is not covered under the contract",
            "the diagnosis falls outside the insured benefits",
            "the treatment is listed as an excluded service"
        ],
        "prefixes": [
            "The insurer rejected the claim because",
            "The claim was declined as",
            "The rejection letter states that",
            "The claim could not be approved because",
            "The settlement was denied because"
        ]
    },
    "Documentation": {
        "reasons": [
            "the discharge summary was not submitted",
            "required medical records are missing",
            "the claim form is incomplete",
            "supporting hospital invoices were not provided",
            "additional diagnostic reports are required"
        ],
        "prefixes": [
            "The insurer rejected the claim because",
            "The claim was declined as",
            "The claim could not be processed because",
            "The rejection notice states that",
            "The settlement request was denied because"
        ]
    },
    "Hospitalization": {
        "reasons": [
            "hospital admission was not medically necessary",
            "the treatment was classified as outpatient care",
            "the minimum hospitalization duration was not satisfied",
            "the admission did not qualify for inpatient coverage",
            "the procedure did not meet day care eligibility requirements"
        ],
        "prefixes": [
            "The insurer rejected the claim because",
            "The claim was declined as",
            "The rejection notice states that",
            "The settlement request was denied because",
            "The claim could not be approved because"
        ]
    },
    "Room Rent or Sub-limit": {
        "reasons": [
            "room rent exceeded the permitted daily allowance",
            "the selected hospital room category was not eligible",
            "the treatment exceeded the applicable sublimit",
            "proportionate deduction was applied due to room charges",
            "the room accommodation exceeded the policy restriction"
        ],
        "prefixes": [
            "The insurer rejected the claim because",
            "The claim was declined as",
            "The rejection notice states that",
            "The settlement request was reduced because",
            "The claim could not be fully approved because"
        ]
    },
    "Policy Validity": {
        "reasons": [
            "the insurance policy had expired",
            "coverage was inactive on the admission date",
            "the policy premium remained unpaid",
            "the insurance contract had lapsed",
            "the policy was not in force during hospitalization"
        ],
        "prefixes": [
            "The insurer rejected the claim because",
            "The claim was declined as",
            "The rejection notice states that",
            "The settlement request was denied because",
            "The claim could not be approved because"
        ]
    },
    "Financial Deduction": {
        "reasons": [
            "a co-payment percentage was applied",
            "the deductible amount reduced the settlement",
            "non-payable expenses were excluded",
            "the insured must share part of the treatment cost",
            "non-medical consumables were deducted"
        ],
        "prefixes": [
            "The insurer reduced the claim because",
            "The settlement amount was adjusted because",
            "The payable amount was reduced because",
            "The claim was partially settled because",
            "The insurer applied deductions because"
        ]
    }
}

rows = []

for category, values in DATA.items():
    for prefix in values["prefixes"]:
        for reason in values["reasons"]:
            rows.append({
                "rejection_reason": f"{prefix} {reason}.",
                "category": category
            })

random.shuffle(rows)

output = Path("datasets/rejection_reasons_expanded.csv")

pd.DataFrame(rows).to_csv(output, index=False)

print("Expanded dataset created successfully.")
print("Total examples:", len(rows))
print("Categories:", len(DATA))
print("Examples per category:", len(rows) // len(DATA))
