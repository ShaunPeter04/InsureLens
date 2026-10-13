import pandas as pd
import joblib

from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix
)

# Load the independent test dataset
df = pd.read_csv("datasets/rejection_reasons_test.csv")

X_test = df["rejection_reason"]
y_test = df["category"]

# Load existing trained models
models = {
    "Logistic Regression": joblib.load(
        "models/rejection_logistic_baseline.joblib"
    ),
    "Decision Tree": joblib.load(
        "models/rejection_classifier.joblib"
    )
}

for model_name, model in models.items():

    print("\n" + "=" * 55)
    print(model_name)
    print("=" * 55)

    # Predict rejection categories
    y_pred = model.predict(X_test)

    # Calculate accuracy
    accuracy = accuracy_score(y_test, y_pred)

    print(f"\nAccuracy: {accuracy * 100:.2f}%")

    print("\nClassification Report:")
    print(
        classification_report(
            y_test,
            y_pred,
            zero_division=0
        )
    )

    print("\nIncorrect Predictions:")

    incorrect = df[y_test != y_pred].copy()
    incorrect["predicted_category"] = y_pred[
        y_test != y_pred
    ]

    if incorrect.empty:
        print("No incorrect predictions.")
    else:
        print(
            incorrect[
                [
                    "rejection_reason",
                    "category",
                    "predicted_category"
                ]
            ].to_string(index=False)
        )