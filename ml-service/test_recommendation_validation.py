import copy
import json
from pathlib import Path
import unittest
from pydantic import ValidationError
from recommendation_validation import UserRequirements, RecommendationRequest

ROOT = Path(__file__).resolve().parent.parent


class RecommendationValidationTests(unittest.TestCase):
    def setUp(self):
        self.requirements = {"requiredCoverage": 500000, "coverageType": "Individual", "age": 35, "gender": "female", "city": "Pune", "annualIncome": 0}
        self.policy = json.loads((ROOT / "server/data/policies.json").read_text())[0]

    def test_valid_and_optional_fields(self):
        model = UserRequirements(**self.requirements)
        self.assertEqual(model.annualIncome, 0)
        self.assertIsNone(model.budget)
        self.assertEqual(RecommendationRequest(userRequirements=model, policies=[]).policies, [])
        self.assertEqual(len(RecommendationRequest(userRequirements=model, policies=[self.policy]).policies), 1)

    def test_invalid_types_ranges_and_selections(self):
        invalid = {
            "requiredCoverage": [0, -1, float("nan"), float("inf"), True, "500000", []],
            "budget": [0, -1, float("inf"), True], "annualIncome": [-1, float("nan"), True],
            "age": [-1, 121, 1.5, True, "35"], "gender": ["unsupported"], "coverageType": ["unsupported"],
            "coPaymentPreference": [-1, 101, None, True], "city": [" ", None],
            "roomRentPreference": ["unsupported"], "alcoholConsumption": ["unsupported", None],
            "isSmokerOrTobaccoUser": ["false", 1], "hasHighRiskOccupation": ["true"],
            "preExistingDiseases": [None, [" "], [None], [{}], ["x" * 201], ["A"] * 101]
        }
        for field, values in invalid.items():
            for value in values:
                with self.subTest(field=field, value=value), self.assertRaises(ValidationError):
                    UserRequirements(**{**self.requirements, field: value})

    def test_malformed_policy_data(self):
        for field, value in {"coverageAmounts": [None], "eligibility": [], "waitingPeriods": None, "hospitalizationCoverage": None, "roomRentLimit": None, "coPaymentPercentage": float("inf")}.items():
            with self.subTest(field=field), self.assertRaises(ValidationError):
                RecommendationRequest(userRequirements=self.requirements, policies=[{**self.policy, field: value}])

    def test_scoring_still_uses_existing_weights_and_eligibility(self):
        from main import calculate_policy_score
        model = UserRequirements(**self.requirements)
        result = calculate_policy_score(self.policy, model)
        self.assertIsNotNone(result)
        self.assertEqual(result["breakdown"]["coverage"], 30)
        self.assertGreaterEqual(result["totalScore"], 0)
        self.assertLessEqual(result["totalScore"], 100)
        too_old = model.model_copy(update={"age": min(120, self.policy["eligibility"]["maxAge"] + 1)})
        self.assertIsNone(calculate_policy_score(self.policy, too_old))
        malformed = copy.deepcopy(self.policy)
        malformed["coverageAmounts"] = []
        self.assertIsNone(calculate_policy_score(malformed, model))


if __name__ == "__main__":
    unittest.main()
