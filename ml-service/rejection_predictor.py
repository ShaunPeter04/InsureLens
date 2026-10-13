
from pathlib import Path
import joblib

BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "models"

LOGISTIC_PATH = MODEL_DIR / "rejection_logistic_v2.joblib"
TREE_PATH = MODEL_DIR / "rejection_classifier.joblib"

_logistic_model = None
_tree_model = None


def load_models():
    global _logistic_model, _tree_model

    if _logistic_model is None:
        _logistic_model = joblib.load(LOGISTIC_PATH)

    if _tree_model is None:
        _tree_model = joblib.load(TREE_PATH)


def predict_rejection(rejection_reason, insurer_remarks=""):
    load_models()

    text = f"{rejection_reason or ''} {insurer_remarks or ''}".strip()

    if not text:
        raise ValueError("Rejection details are required")

    logistic_prediction = str(_logistic_model.predict([text])[0])
    tree_prediction = str(_tree_model.predict([text])[0])

    probabilities = _logistic_model.predict_proba([text])[0]
    classes = _logistic_model.classes_

    class_scores = {
        str(category): round(float(score), 4)
        for category, score in zip(classes, probabilities)
    }

    highest_score = float(max(probabilities))
    model_agreement = logistic_prediction == tree_prediction

    # Experimental thresholds, not calibrated confidence levels.
    low_score = highest_score < 0.55
    model_disagreement = not model_agreement

    # Until validated on representative rejection letters,
    # every prediction requires human review.
    needs_review = True

    review_reasons = []

    if low_score:
        review_reasons.append("Low model class score")

    if model_disagreement:
        review_reasons.append("Models predict different categories")

    review_reasons.append(
        "Synthetic-data model requires human verification"
    )

    return {
        "primaryModel": "TF-IDF + Logistic Regression V2",
        "primaryPrediction": logistic_prediction,
        "decisionTreePrediction": tree_prediction,
        "modelAgreement": model_agreement,
        "classScores": class_scores,
        "highestClassScore": round(highest_score, 4),
        "requiresManualReview": needs_review,
        "reviewReasons": review_reasons,
        "evaluationNote": (
            "Experimental classification trained on synthetic data. "
            "Class scores are uncalibrated and must not be interpreted "
            "as probabilities of classification correctness, claim "
            "approval, or appeal success. Human verification is required."
        )
    }
