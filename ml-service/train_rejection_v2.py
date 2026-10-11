import pandas as pd
import joblib
from pathlib import Path

from sklearn.pipeline import Pipeline
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    classification_report
)

# Load datasets
train_df = pd.read_csv(
    "datasets/rejection_reasons_v2.csv"
)

test_df = pd.read_csv(
    "datasets/rejection_reasons_test_v2.csv"
)

X_train = train_df["rejection_reason"]
y_train = train_df["category"]

X_test = test_df["rejection_reason"]
y_test = test_df["category"]

# Define models
models = {
    "Logistic Regression": Pipeline([
        ("tfidf", TfidfVectorizer(
            ngram_range=(1, 2),
            sublinear_tf=True
        )),
        ("classifier", LogisticRegression(
            max_iter=2000,
            class_weight="balanced",
            random_state=42
        ))
    ]),

    "Decision Tree": Pipeline([
        ("tfidf", TfidfVectorizer(
            ngram_range=(1, 2)
        )),
        ("classifier", DecisionTreeClassifier(
            random_state=42,
            class_weight="balanced",
            min_samples_leaf=2
        ))
    ])
}

Path("models").mkdir(exist_ok=True)

for name, model in models.items():

    print("\n" + "=" * 55)
    print(name)
    print("=" * 55)

    model.fit(X_train, y_train)

    predictions = model.predict(X_test)

    accuracy = accuracy_score(y_test, predictions)
    macro_f1 = f1_score(
        y_test,
        predictions,
        average="macro"
    )

    print(f"Accuracy: {accuracy * 100:.2f}%")
    print(f"Macro F1: {macro_f1:.4f}")

    print("\nClassification Report:")
    print(
        classification_report(
            y_test,
            predictions,
            zero_division=0
        )
    )

    print("\nIncorrect Predictions:")

    incorrect = test_df[
        y_test != predictions
    ].copy()

    incorrect["predicted_category"] = predictions[
        y_test != predictions
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

    filename = (
        "rejection_logistic_v2.joblib"
        if name == "Logistic Regression"
        else "rejection_tree_v2.joblib"
    )

    joblib.dump(
        model,
        f"models/{filename}"
    )

    print(f"\nSaved: models/{filename}")

print("\nTraining and evaluation completed.")