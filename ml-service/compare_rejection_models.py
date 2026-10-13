
import pandas as pd

from sklearn.model_selection import (
    train_test_split,
    StratifiedKFold,
    cross_val_score
)
from sklearn.pipeline import Pipeline
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.tree import DecisionTreeClassifier

df = pd.read_csv("datasets/rejection_reasons.csv")

X = df["rejection_reason"]
y = df["category"]

X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.25,
    random_state=42,
    stratify=y
)

configs = [
    {"max_depth": 5, "criterion": "gini"},
    {"max_depth": 10, "criterion": "gini"},
    {"max_depth": None, "criterion": "gini"},
    {"max_depth": 5, "criterion": "entropy"},
    {"max_depth": 10, "criterion": "entropy"},
    {"max_depth": None, "criterion": "entropy"},
]

cv = StratifiedKFold(
    n_splits=3,
    shuffle=True,
    random_state=42
)

results = []

for config in configs:
    model = Pipeline([
        ("tfidf", TfidfVectorizer(ngram_range=(1, 2))),
        ("classifier", DecisionTreeClassifier(
            **config,
            random_state=42
        ))
    ])

    scores = cross_val_score(
        model,
        X_train,
        y_train,
        cv=cv,
        scoring="f1_macro"
    )

    results.append({
        "depth": str(config["max_depth"]),
        "criterion": config["criterion"],
        "mean_f1": scores.mean(),
        "std_f1": scores.std()
    })

results = sorted(
    results,
    key=lambda item: item["mean_f1"],
    reverse=True
)

print("\nDECISION TREE COMPARISON")
print("-" * 55)

for result in results:
    print(
        f"Depth: {result['depth']:>4} | "
        f"Criterion: {result['criterion']:<7} | "
        f"CV Macro F1: {result['mean_f1']:.3f} "
        f"(± {result['std_f1']:.3f})"
    )

print("\nBest configuration:")
print(results[0])
