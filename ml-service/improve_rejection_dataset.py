import pandas as pd

INPUT_FILE = "datasets/rejection_reasons_expanded.csv"
OUTPUT_FILE = "datasets/rejection_reasons_improved.csv"

df = pd.read_csv(INPUT_FILE)

documentation_examples = [
    "Deficiency in submitted documentation.",
    "Incomplete hospital indoor case papers.",
    "Claim rejected due to non submission of indoor patient records.",
    "Hospital case sheets have not been provided.",
    "Insufficient medical documentation submitted for claim assessment.",
    "Claim documents are deficient and require clarification.",
    "Indoor case papers are incomplete.",
    "The insurer requested additional treatment records.",
    "Missing inpatient treatment notes.",
    "Original hospital documents were not submitted.",
    "Claim kept pending due to document deficiency.",
    "Hospital admission records are unavailable.",
    "Nursing charts and treatment sheets are missing.",
    "Medical case file was not provided.",
    "Discharge summary contains incomplete information.",
    "Insufficient supporting evidence for hospitalization.",
    "The claim cannot be processed due to incomplete paperwork.",
    "Deficiency letter issued for missing medical records.",
    "Hospital indoor patient file was not attached.",
    "Additional documents are required to verify the claim."
]

new_rows = pd.DataFrame({
    "rejection_reason": documentation_examples,
    "category": ["Documentation"] * len(documentation_examples)
})

improved_df = pd.concat(
    [df, new_rows],
    ignore_index=True
)

improved_df = improved_df.drop_duplicates(
    subset=["rejection_reason"]
)

improved_df.to_csv(OUTPUT_FILE, index=False)

print("Original records:", len(df))
print("New records:", len(improved_df))

print("\nCategory distribution:")
print(improved_df["category"].value_counts())