
import pandas as pd
import joblib

from pathlib import Path

from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.tree import DecisionTreeClassifier
from sklearn.pipeline import Pipeline

from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix
)

# 1. Load dataset
df = pd.read_csv("datasets/rejection_reasons.csv")

X = df["rejection_reason"]
y = df["category"]

# 2. Split dataset
X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.25,
    random_state=42,
    stratify=y
)

# 3. Create ML pipeline
model = Pipeline([
    (
        "tfidf",
        TfidfVectorizer(
            lowercase=True,
            ngram_range=(1, 2)
        )
    ),
    (
        "classifier",
        DecisionTreeClassifier(
            criterion="gini",
            max_depth=None,
            random_state=42
        )
    )
])

# 4. Train model
model.fit(X_train, y_train)

# 5. Predict test data
y_pred = model.predict(X_test)

# 6. Evaluate
accuracy = accuracy_score(y_test, y_pred)

print("\nMODEL EVALUATION")
print("-------------------------")
print(f"Training samples: {len(X_train)}")
print(f"Testing samples: {len(X_test)}")
print(f"Accuracy: {accuracy * 100:.2f}%")

print("\nClassification Report:")
print(
    classification_report(
        y_test,
        y_pred,
        zero_division=0
    )
)

print("\nConfusion Matrix:")
print(confusion_matrix(y_test, y_pred))

# 7. Save trained pipeline
Path("models").mkdir(exist_ok=True)

joblib.dump(
    model,
    "models/rejection_classifier.joblib"
)

print("\nModel saved successfully.")

# 8. Test a sample prediction
sample = [
    "The claim was rejected because the policy waiting period was not completed."
]

prediction = model.predict(sample)[0]

print("\nSample Prediction:")
print("Input:", sample[0])
print("Predicted Category:", prediction)
