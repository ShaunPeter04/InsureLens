import unittest
from main import extract_basic_policy_info


class WaitingPeriodExtractionTests(unittest.TestCase):
    def test_missing_definitions_are_unknown_not_zero(self):
        result = extract_basic_policy_info('Synthetic document. Waiting periods must be confirmed with the insurer.')
        waiting = result['waitingPeriods']
        self.assertIsNone(waiting['initialDays'])
        self.assertIsNone(waiting['specificIllnessesMonths'])
        self.assertIsNone(waiting['preExistingDiseasesMonths'])

    def test_explicit_definitions_including_zero_are_preserved(self):
        result = extract_basic_policy_info('Initial waiting period: 0 days. Specific waiting period: 24 months. Pre-Existing disease - 36 months.')
        waiting = result['waitingPeriods']
        self.assertEqual(waiting['initialDays'], 0)
        self.assertEqual(waiting['specificIllnessesMonths'], 24)
        self.assertEqual(waiting['preExistingDiseasesMonths'], 36)

    def test_free_text_exceptions_do_not_become_a_blanket_zero_period(self):
        result = extract_basic_policy_info('Accidental hospitalizations may have no initial waiting period. Optional endorsements and continuity benefits require insurer verification.')
        self.assertIsNone(result['waitingPeriods']['initialDays'])


if __name__ == '__main__':
    unittest.main()
