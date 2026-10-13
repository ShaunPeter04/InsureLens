from io import BytesIO
from pypdf import PdfReader
from fastapi import HTTPException

MAX_BYTES = 10 * 1024 * 1024
MAX_PAGES = 50
MAX_TEXT = 200000


def process_text_pdf(data, parser):
    if not data or len(data) > MAX_BYTES:
        raise HTTPException(413, "Upload a nonempty PDF no larger than 10 MB.")
    if not data.startswith(b"%PDF-"):
        raise HTTPException(400, "The file is not a valid PDF policy document.")
    try:
        reader = PdfReader(BytesIO(data), strict=True)
        if reader.is_encrypted:
            raise HTTPException(422, "Password-protected PDFs are not supported. Use an unencrypted copy.")
        if not 1 <= len(reader.pages) <= MAX_PAGES:
            raise HTTPException(422, "Use a PDF containing 1 to 50 pages.")
        pages = []
        for page in reader.pages:
            text = (page.extract_text() or "").strip()
            if not text:
                raise HTTPException(422, "A page has no readable text. Scanned or mixed-image PDFs are not supported in this demonstration.")
            pages.append(text)
            if sum(map(len, pages)) > MAX_TEXT:
                raise HTTPException(422, "The document contains too much text. Use a shorter policy PDF.")
        text = "\n".join(pages)
        if len(text) < 100:
            raise HTTPException(422, "Unable to extract sufficient policy text. Use a readable text-based PDF.")
        info = parser(text)
        # Keep only short policy-rule evidence for source checks, not full PII-bearing text.
        markers = ("waiting", "pre-existing", "diseases excluded", "room rent", "co-payment", "co payment", "deductible", "stays for at least", "day care")
        evidence = "\n".join(line[:500] for line in text.splitlines()
                             if any(word in line.lower() for word in markers))[:12000]
        return {"pageCount": len(reader.pages), "characterCount": len(text),
                "extractionMethod": "PDF Text", "requiresOcr": False,
                "extractedText": evidence, "extractedPolicyData": info}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(422, "The PDF is malformed or cannot be read. Use a valid text-based PDF.")
