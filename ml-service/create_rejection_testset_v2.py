import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

TRAIN_FILE = "datasets/rejection_reasons_v2.csv"
TEST_FILE = "datasets/rejection_reasons_test_v2.csv"

examples = {
    "Documentation": [
        "The TPA raised a query seeking the treating doctor's progress notes.",
        "The submitted claim packet lacks the operation theatre register extract.",
        "Insurer requires a legible copy of the patient's inpatient chart."
    ],
    "Financial Deduction": [
        "The admissible settlement was reduced by the insured's cost-sharing obligation.",
        "A fixed amount must be borne by the policyholder before reimbursement.",
        "The insurer disallowed miscellaneous consumable charges from the final bill."
    ],
    "Hospitalization": [
        "The medical review concluded that overnight admission was not clinically justified.",
        "The procedure was performed without qualifying inpatient care.",
        "The treatment duration did not meet the applicable admission requirement."
    ],
    "Policy Exclusion": [
        "The requested service is outside the contract's list of insured benefits.",
        "The insurer invoked a contractual exclusion for the proposed therapy.",
        "The expense relates to a treatment expressly omitted from coverage."
    ],
    "Policy Validity": [
        "The member's insurance protection had ended before the medical event.",
        "No active cover was recorded against the insured on the service date.",
        "The renewal gap left the claimant without an effective policy."
    ],
    "Pre-existing Disease": [
        "Earlier prescriptions show the same ailment was being managed before enrollment.",
        "The insurer alleges that the patient's longstanding disorder was concealed.",
        "Prior specialist visits indicate the diagnosis preceded the start of cover."
    ],
    "Room Rent or Sub-limit": [
        "The selected accommodation category was above the policy's permitted room entitlement.",
        "The surgical package exceeded the maximum benefit allocated to that procedure.",
        "The hospital charged more than the contractual per-day accommodation allowance."
    ],
    "Waiting Period": [
        "Benefits for the diagnosed condition had not yet become eligible under the deferred coverage clause.",
        "The minimum uninterrupted insurance duration required for this treatment was not met.",
        "The hospitalization occurred before the temporary restriction on benefits ended."
    ]
}

train_df = pd.read_csv(TRAIN_FILE)

test_df = pd.DataFrame(
    [
        {"rejection_reason": reason, "category": category}
        for category, reasons in examples.items()
        for reason in reasons
    ]
)

normalize = lambda s: " ".join(str(s).lower().split())

train_text = train_df["rejection_reason"].map(normalize)
test_text = test_df["rejection_reason"].map(normalize)

overlap = set(train_text) & set(test_text)

if overlap:
    raise ValueError(f"Exact training/test overlap: {overlap}")

# Diagnostic only: similar wording is not necessarily leakage.
vectorizer = TfidfVectorizer(ngram_range=(1, 2))
matrix = vectorizer.fit_transform(
    pd.concat([train_text, test_text], ignore_index=True)
)

similarity = cosine_similarity(
    matrix[len(train_df):],
    matrix[:len(train_df)]
)

test_df["max_training_similarity"] = similarity.max(axis=1)

test_df[["rejection_reason", "category"]].to_csv(
    TEST_FILE,
    index=False
)

print("Training examples:", len(train_df))
print("Test examples:", len(test_df))
print("Exact overlaps:", len(overlap))
print("Highest similarity:", round(similarity.max(), 4))

print("\nCategory distribution:")
print(test_df["category"].value_counts())

print("\nMost similar test examples:")
print(
    test_df.sort_values(
        "max_training_similarity",
        ascending=False
    ).head(5).to_string(index=False)
)