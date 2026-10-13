"""Fictional PDF fixtures; no personal insurance data or external dependencies."""
from io import BytesIO
from pypdf import PdfWriter
from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject

POLICY_TEXT = """Synthetic Insurance Company Limited
SAMPOORNA AROGYA - GROUP
Fictional test policy. This is not an insurance contract.
Initial waiting period: 0 days
Specific waiting period: 24 months
Pre-Existing disease - 36 months
Room Rent, Boarding & Nursing Charges (1% of Sum Insured)
Co-payment: 0%
Deductible: INR 0
The insured stays for at least 24 hours.
All applicable exclusions and endorsements require manual review.
"""


def text_pdf(text=POLICY_TEXT, encrypted=False):
    writer = PdfWriter()
    page = writer.add_blank_page(width=612, height=792)
    font = DictionaryObject({NameObject('/Type'): NameObject('/Font'), NameObject('/Subtype'): NameObject('/Type1'), NameObject('/BaseFont'): NameObject('/Helvetica')})
    page[NameObject('/Resources')] = DictionaryObject({NameObject('/Font'): DictionaryObject({NameObject('/F1'): writer._add_object(font)})})
    lines = [line.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)') for line in text.splitlines()]
    stream = DecodedStreamObject()
    stream.set_data(('BT /F1 10 Tf 30 750 Td 14 TL ' + ' '.join('('+line+') Tj T*' for line in lines) + ' ET').encode('ascii'))
    page[NameObject('/Contents')] = writer._add_object(stream)
    if encrypted:
        writer.encrypt('synthetic-test-only')
    output = BytesIO()
    writer.write(output)
    return output.getvalue()
