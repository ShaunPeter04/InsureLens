"""Synthetic rule/quote fixtures never mutate or supplement catalog definitions."""
import copy
import json
from pathlib import Path
import unittest
from pydantic import ValidationError
from recommendation_validation import InsuredMember, UserRequirements, RecommendationRequest
from recommendation_assessment import assess_budget, assess_catalog_premium, assess_family_eligibility
from main import recommend, calculate_policy_score

ROOT = Path(__file__).resolve().parent.parent


class RecommendationAssessmentTests(unittest.TestCase):
    def setUp(self):
        self.policy = json.loads((ROOT / 'server/data/policies.json').read_text())[0]
        self.policy['_id'] = '111111111111111111111111'
        self.requirements = dict(requiredCoverage=500000, coverageType='Individual', age=35, gender='female', city='Pune', budget=20000)

    def family(self, ages=(35, 40), relationships=('Self', 'Spouse')):
        return [InsuredMember(memberType='Self' if relationship == 'Self' else 'FamilyMember', relationship=relationship, age=age) for age, relationship in zip(ages, relationships)]

    def test_verified_annual_premium_within_budget(self):
        # An explicitly annual quote fixture, not a claimed premium for a real plan.
        self.assertEqual(assess_budget(15000, 20000)['status'], 'Within Budget')
        self.assertEqual(assess_budget(20000, 20000)['status'], 'Within Budget')

    def test_verified_annual_premium_above_budget(self):
        self.assertEqual(assess_budget(25000, 20000)['status'], 'Above Budget')

    def test_unknown_and_unscoped_base_premiums_never_establish_affordability(self):
        for base in (None, 0, 15000, -1, float("nan"), "unavailable"):
            policy = {**self.policy, 'basePremium': base}
            result = assess_catalog_premium(policy, 20000)
            self.assertEqual(result['status'], 'Insufficient Information')
            self.assertIsNone(result['annualPremium'])
            self.assertIn('cannot be verified', result['message'])
        self.assertEqual(assess_budget(None, 20000)['status'], 'Insufficient Information')
        self.assertEqual(assess_budget(15000, None)['status'], 'No Budget Provided')

    def test_unknown_premiums_do_not_exclude_recommendations_or_change_scores(self):
        model = UserRequirements(**self.requirements)
        response = recommend(RecommendationRequest(userRequirements=model, policies=[self.policy]))
        self.assertEqual(len(response['recommendations']), 1)
        item = response['recommendations'][0]
        self.assertEqual(item['premiumAssessment']['budget'], 20000)
        self.assertEqual(item['premiumAssessment']['status'], 'Insufficient Information')
        no_budget = model.model_copy(update={'budget': None})
        self.assertEqual(calculate_policy_score(self.policy, model), calculate_policy_score(self.policy, no_budget))
        self.assertNotIn('familyEligibility', item)

    def test_all_adult_family_members_are_checked(self):
        members = self.family((30, 40, 60), ('Self', 'Spouse', 'Mother'))
        result = assess_family_eligibility(self.policy, members)
        self.assertEqual(len(result['members']), 3)
        self.assertEqual([item['ageStatus'] for item in result['members']], ['Eligible'] * 3)
        self.assertEqual(result['status'], 'Insufficient Information') # No relationship rules in the catalog.
        model = UserRequirements(**{**self.requirements, 'coverageType':'Family Floater', 'insuredMembers':members})
        item = recommend(RecommendationRequest(userRequirements=model, policies=[self.policy]))['recommendations'][0]
        self.assertEqual(len(item['familyEligibility']['members']), 3)

    def test_younger_adult_violation_cannot_be_hidden_by_the_eldest(self):
        # Synthetic documented entry-age rule: the oldest age 40 passes, age 20 fails.
        policy = copy.deepcopy(self.policy)
        policy['eligibility']['minAge'] = 21
        members = self.family((40, 20))
        assessment = assess_family_eligibility(policy, members)
        self.assertEqual([item['ageStatus'] for item in assessment['members']], ['Eligible', 'Ineligible'])
        model = UserRequirements(**{**self.requirements, 'age':40, 'coverageType':'Family Floater', 'insuredMembers':members})
        self.assertIsNone(calculate_policy_score(policy, model))

    def test_member_violates_documented_maximum(self):
        policy = copy.deepcopy(self.policy)
        policy['eligibility']['maxAge'] = 65
        result = assess_family_eligibility(policy, self.family((35, 70), ('Self', 'Mother')))
        self.assertEqual(result['status'], 'Ineligible')
        self.assertEqual(result['members'][1]['ageStatus'], 'Ineligible')

    def test_missing_rules_do_not_exclude_families(self):
        for eligibility in (None, {}, {'familyFloaterAllowed':True}, {'minAge':18, 'maxAge':65}):
            policy = {**self.policy, 'eligibility':eligibility}
            model = UserRequirements(**{**self.requirements, 'coverageType':'Family Floater', 'insuredMembers':self.family()})
            request = RecommendationRequest(userRequirements=model, policies=[policy])
            items = recommend(request)['recommendations']
            self.assertEqual(len(items), 1)
            self.assertEqual(items[0]['familyEligibility']['status'], 'Insufficient Information')

    def test_partial_age_rules_are_applied_without_inventing_other_bounds(self):
        for eligibility, ages in [({'maxAge':65}, (35, 70)), ({'minAge':21}, (40, 20))]:
            result = assess_family_eligibility({**self.policy, 'eligibility':eligibility}, self.family(ages))
            self.assertEqual(result['status'], 'Ineligible')
        result = assess_family_eligibility({**self.policy, 'eligibility':{'maxAge':65}}, self.family())
        self.assertEqual(result['status'], 'Insufficient Information')
        self.assertEqual([item['ageStatus'] for item in result['members']], ['Insufficient Information'] * 2)

    def test_children_and_undocumented_relationships_are_not_rejected(self):
        model = UserRequirements(**{**self.requirements, 'coverageType':'Family Floater', 'insuredMembers':self.family((35, 8), ('Self', 'Son'))})
        item = recommend(RecommendationRequest(userRequirements=model, policies=[self.policy]))['recommendations'][0]
        self.assertEqual(item['familyEligibility']['members'][1]['ageStatus'], 'Insufficient Information')
        self.assertEqual(item['familyEligibility']['members'][1]['relationshipStatus'], 'Insufficient Information')
        self.assertEqual(len(item['familyEligibility']['members']), 2)

    def test_missing_member_data_and_legacy_scalar_age_are_insufficient(self):
        self.assertEqual(assess_family_eligibility(self.policy, [])['status'], 'Insufficient Information')
        model = UserRequirements(**{**self.requirements, 'coverageType':'Family Floater', 'age':110})
        self.assertIsNotNone(calculate_policy_score(self.policy, model))
        missing_age = InsuredMember(memberType='FamilyMember', relationship='Mother')
        self.assertEqual(assess_family_eligibility(self.policy, [missing_age])['members'][0]['ageStatus'], 'Insufficient Information')

    def test_explicit_family_coverage_exclusion_still_applies(self):
        policy = copy.deepcopy(self.policy)
        policy['eligibility']['familyFloaterAllowed'] = False
        for members in (self.family(), []):
            self.assertEqual(assess_family_eligibility(policy, members)['status'], 'Ineligible')

    def test_individual_age_matching_and_score_weights_are_unchanged(self):
        model = UserRequirements(**self.requirements)
        score = calculate_policy_score(self.policy, model)
        self.assertEqual(score['breakdown']['coverage'], 30)
        self.assertEqual(score['breakdown']['coPayment'], 15)
        self.assertIsNone(calculate_policy_score(self.policy, model.model_copy(update={'age':120})))

    def test_invalid_member_payloads_are_rejected(self):
        for data in ({'memberType':'Other'}, {'memberType':'Self', 'age':True}, {'memberType':'Self', 'age':121}, {'memberType':'Self', 'relationship':[]}, {'memberType':'Self', 'isDependent':'true'}):
            with self.subTest(data=data), self.assertRaises(ValidationError):
                InsuredMember(**data)


if __name__ == '__main__':
    unittest.main()
