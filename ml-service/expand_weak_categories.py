import pandas as pd

INPUT_FILE = "datasets/rejection_reasons_improved.csv"
OUTPUT_FILE = "datasets/rejection_reasons_v2.csv"

examples = {
    "Pre-existing Disease": [
        "The condition existed before the insurance policy was purchased.",
        "Patient was diagnosed with the illness before obtaining coverage.",
        "Medical history shows the disease predates policy commencement.",
        "The insured was receiving treatment before enrollment.",
        "The illness was present prior to the policy inception date.",
        "Previous consultation records indicate an existing condition.",
        "The disease was diagnosed before the insurance contract began.",
        "Hospital records indicate a longstanding medical condition.",
        "The claimant had the same medical condition before purchasing insurance.",
        "The insurer cited a previously existing illness."
    ],

    "Waiting Period": [
        "Claim submitted during the initial exclusion period.",
        "The first thirty days of coverage had not elapsed.",
        "Treatment occurred before completion of the mandatory waiting duration.",
        "The insured has not completed the required continuous coverage period.",
        "The claim falls within the first 30 days after policy inception.",
        "Coverage for this illness begins only after the stipulated waiting duration.",
        "The specified disease is not covered during the first two years.",
        "The claim was submitted before the disease-specific waiting restriction expired.",
        "The contractual waiting duration remains unfulfilled.",
        "The treatment occurred within the initial thirty-day restriction."
    ],

    "Policy Validity": [
        "The insurance contract was terminated before admission.",
        "Coverage had ceased on the hospitalization date.",
        "The policy was cancelled before the claim event.",
        "The insurance renewal was not completed.",
        "The insured was not covered on the treatment date.",
        "The premium payment default caused the policy to lapse.",
        "The contract was no longer active when treatment began.",
        "The claim occurred after the policy expiry date.",
        "Insurance protection ended before hospitalization.",
        "The policy had been discontinued before admission."
    ]
}

new_rows = []

for category, reasons in examples.items():
    for reason in reasons:
        new_rows.append({
            "rejection_reason": reason,
            "category": category
        })

df = pd.read_csv(INPUT_FILE)

new_df = pd.DataFrame(new_rows)

combined = pd.concat(
    [df, new_df],
    ignore_index=True
)

combined = combined.drop_duplicates(
    subset=["rejection_reason"]
)

combined.to_csv(OUTPUT_FILE, index=False)

print("Original records:", len(df))
print("Updated records:", len(combined))

print("\nCategory distribution:")
print(combined["category"].value_counts())