import asyncio
import unittest
from io import BytesIO
from fastapi import HTTPException, UploadFile
from starlette.datastructures import Headers
from pypdf import PdfWriter
from pdf_processing import process_text_pdf, MAX_BYTES
from pdf_test_fixture import text_pdf
from main import extract_basic_policy_info, extract_policy_text


class PDFProcessingTests(unittest.TestCase):
    def process(self, data):
        return process_text_pdf(data, extract_basic_policy_info)

    def rejected(self, data, code):
        with self.assertRaises(HTTPException) as caught:
            self.process(data)
        self.assertEqual(caught.exception.status_code, code)
        self.assertNotIn('Traceback', caught.exception.detail)

    def test_actual_text_pdf_endpoint_and_zero_terms(self):
        upload = UploadFile(file=BytesIO(text_pdf()), headers=Headers({'content-type': 'application/pdf'}))
        result = asyncio.run(extract_policy_text(upload))
        self.assertEqual(result['extractionMethod'], 'PDF Text')
        self.assertEqual(result['pageCount'], 1)
        terms = result['extractedPolicyData']
        self.assertEqual(terms['coPaymentPercentage'], 0)
        self.assertEqual(terms['deductibleAmount'], 0)
        self.assertEqual(terms['waitingPeriods']['initialDays'], 0)
        self.assertEqual(terms['roomRentLimit']['percentageOfSumInsured'], 1)
        self.assertIsNone(terms['majorExclusions'])
        self.assertIsNone(terms['hospitalizationCoverage']['daycareTreatmentsCovered'])
        self.assertNotIn('Fictional test policy', result['extractedText'])

    def test_missing_terms_are_null(self):
        terms = self.process(text_pdf('Synthetic document without insurance rules.\n' * 8))['extractedPolicyData']
        for field in ['coPaymentPercentage', 'deductibleAmount', 'majorExclusions', 'subLimits']:
            self.assertIsNone(terms[field])
        self.assertIsNone(terms['roomRentLimit']['hasCap'])
        self.assertIsNone(terms['hospitalizationCoverage']['inpatientCovered'])

    def test_explicit_zero_and_conflicting_numeric_terms(self):
        self.assertEqual(extract_basic_policy_info('Co-payment: 0%. Deductible: INR 0')['coPaymentPercentage'], 0)
        self.assertIsNone(extract_basic_policy_info('Co-payment: 0%. Co-payment: 20%.')['coPaymentPercentage'])
        self.assertIsNone(extract_basic_policy_info('Deductible: INR 1,000')['deductibleAmount'])
        self.assertIsNone(extract_basic_policy_info('Initial waiting period: 0 days. Initial waiting period: 30 days')['waitingPeriods']['initialDays'])
        self.assertEqual(extract_basic_policy_info('Room Rent, Boarding & Nursing Charges (0% of Sum Insured)')['roomRentLimit']['percentageOfSumInsured'], 0)

    def test_bad_signature_and_malformed_pdf(self):
        self.rejected(b'not a PDF', 400)
        self.rejected(b'%PDF-1.7\ninvalid object', 422)

    def test_encrypted_pdf(self):
        self.rejected(text_pdf(encrypted=True), 422)

    def test_limits(self):
        self.rejected(b'', 413)
        self.rejected(b'%PDF-' + b' ' * MAX_BYTES, 413)
        writer = PdfWriter()
        for _ in range(51):
            writer.add_blank_page(width=100, height=100)
        buf = BytesIO(); writer.write(buf)
        self.rejected(buf.getvalue(), 422)

    def test_empty_or_scanned_page_is_not_silently_accepted(self):
        self.rejected(text_pdf(''), 422)

    def test_invalid_mime(self):
        upload = UploadFile(file=BytesIO(text_pdf()), headers=Headers({'content-type': 'text/plain'}))
        with self.assertRaises(HTTPException) as caught:
            asyncio.run(extract_policy_text(upload))
        self.assertEqual(caught.exception.status_code, 400)
