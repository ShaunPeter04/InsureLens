from pydantic import BaseModel
from fastapi import FastAPI, UploadFile, File, HTTPException
from typing import Optional
from pypdf import PdfReader
from io import BytesIO
from pdf2image import convert_from_bytes
import pytesseract


import re

app=FastAPI()

@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "insurelens-ml-service"
    }

class UserRequirements(BaseModel):
    requiredCoverage: float
    coverageType: str

    age: int
    gender: str
    city: str

    annualIncome: Optional[float] = None
    budget: Optional[float] = None

    preExistingDiseases: list[str] = []

    isSmokerOrTobaccoUser: bool = False
    alcoholConsumption: Optional[str] = None
    hasHighRiskOccupation: bool = False

    coPaymentPreference: Optional[float] = 0

    roomRentPreference: Optional[str] = "No Restriction"


class RecommendationRequest(BaseModel):
    userRequirements: UserRequirements
    policies: list[dict]

def get_matched_coverage(coverage_amounts, required_coverage):
    eligible_coverages = [
        amount
        for amount in coverage_amounts
        if amount >= required_coverage
    ]

    if not eligible_coverages:
        return None

    return min(eligible_coverages)


def calculate_policy_score(policy, requirements):

    policy_types = policy.get("policyType", [])

    # Coverage type eligibility
    if requirements.coverageType not in policy_types:
        return None

    # Get policy eligibility rules
    eligibility = policy.get("eligibility", {})

    # Family Floater eligibility
    if requirements.coverageType == "Family Floater":
        if not eligibility.get("familyFloaterAllowed", False):
            return None

    # Age eligibility
    min_age = eligibility.get("minAge", 18)
    max_age = eligibility.get("maxAge", 65)

    if requirements.age < min_age or requirements.age > max_age:
        return None
    
    matched_coverage = get_matched_coverage(
        policy.get("coverageAmounts", []),
        requirements.requiredCoverage
    )

    if matched_coverage is None:
        return None

    score = 0

    # Coverage: 30 points
    # Policies below the requested coverage have already been filtered out.
    # Any policy meeting or exceeding the requested coverage receives
    # the full coverage eligibility score.
    coverage_score = 30

    score += coverage_score
        # Co-payment: 15 points
    policy_copay = policy.get("coPaymentPercentage", 0)
    preferred_copay = requirements.coPaymentPreference

    if policy_copay <= preferred_copay:
        copay_score = 15
    else:
        difference = policy_copay - preferred_copay

        copay_score = max(
            0,
            15 - (difference / 100 * 15)
        )

    score += copay_score

        # Room-rent limit: 15 points
    room_rent = policy.get("roomRentLimit", {})

    has_cap = room_rent.get("hasCap", False)
    room_type = room_rent.get("roomTypeAllowed", "No Restriction")

    if requirements.roomRentPreference == "No Restriction":

        if not has_cap and room_type == "No Restriction":
            room_rent_score = 15

        elif not has_cap:
            room_rent_score = 12

        elif room_type == "Single Private AC":
            room_rent_score = 10

        elif room_type == "Twin Sharing":
            room_rent_score = 7

        else:
            room_rent_score = 4

    else:
        # User is flexible about room-rent restrictions
        if not has_cap:
            room_rent_score = 15
        else:
            room_rent_score = 10

    score += room_rent_score



    # Pre-existing disease handling: 15 points
    user_peds = requirements.preExistingDiseases

    waiting_periods = policy.get("waitingPeriods", {})

    ped_wait_months = waiting_periods.get(
        "preExistingDiseasesMonths",
        36
    )

    if len(user_peds) == 0:
        ped_score = 0
        ped_applicable = False

    else:
        ped_applicable = True

        if ped_wait_months <= 12:
            ped_score = 15
        elif ped_wait_months <= 24:
            ped_score = 12
        elif ped_wait_months <= 36:
            ped_score = 9
        else:
            ped_score = 5

    if ped_applicable:
        score += ped_score

        # General waiting periods: 10 points
    initial_wait = waiting_periods.get("initialDays", 30)
    specific_wait = waiting_periods.get(
        "specificIllnessesMonths",
        24
    )

    # Initial waiting period: max 5 points
    if initial_wait <= 30:
        initial_wait_score = 5
    elif initial_wait <= 60:
        initial_wait_score = 3
    elif initial_wait <= 90:
        initial_wait_score = 1
    else:
        initial_wait_score = 0

    # Specific illness waiting period: max 5 points
    if specific_wait <= 12:
        specific_wait_score = 5
    elif specific_wait <= 24:
        specific_wait_score = 4
    elif specific_wait <= 36:
        specific_wait_score = 2
    else:
        specific_wait_score = 0

    waiting_period_score = (
        initial_wait_score + specific_wait_score
    )

    score += waiting_period_score

        # Hospitalization coverage: 15 points
    hospitalization = policy.get("hospitalizationCoverage", {})

    inpatient_covered = hospitalization.get(
        "inpatientCovered",
        False
    )

    daycare_covered = hospitalization.get(
        "daycareTreatmentsCovered",
        False
    )

    pre_days = hospitalization.get(
        "preHospitalizationDays",
        0
    )

    post_days = hospitalization.get(
        "postHospitalizationDays",
        0
    )

    # Inpatient coverage: 5 points
    inpatient_score = 5 if inpatient_covered else 0

    # Daycare coverage: 3 points
    daycare_score = 3 if daycare_covered else 0

    # Pre-hospitalization: 3 points
    if pre_days >= 60:
        pre_hospital_score = 3
    elif pre_days >= 30:
        pre_hospital_score = 2
    elif pre_days > 0:
        pre_hospital_score = 1
    else:
        pre_hospital_score = 0

    # Post-hospitalization: 4 points
    if post_days >= 90:
        post_hospital_score = 4
    elif post_days >= 60:
        post_hospital_score = 3
    elif post_days >= 30:
        post_hospital_score = 2
    elif post_days > 0:
        post_hospital_score = 1
    else:
        post_hospital_score = 0
        
    hospitalization_score = (
        inpatient_score
        + daycare_score
        + pre_hospital_score
        + post_hospital_score
    )

    score += hospitalization_score

        # Normalize score to 100 based on applicable factors
    max_applicable_score = 100 if ped_applicable else 85

    normalized_score = (
        score / max_applicable_score
    ) * 100

    return {
    "totalScore": round(normalized_score, 2),
    "breakdown": {
        "coverage": round(coverage_score, 2),
        "coPayment": round(copay_score, 2),
        "roomRent": round(room_rent_score, 2),
    "preExistingDisease": {
        "applicable": ped_applicable,
        "score": round(ped_score, 2)
    },     
   "waitingPeriods": {
            "score": round(waiting_period_score, 2),
            "initialWaiting": round(initial_wait_score, 2),
            "specificIllnessWaiting": round(specific_wait_score, 2)
        },
        "hospitalization": {
           "score": round(hospitalization_score, 2),
            "inpatient": round(inpatient_score, 2),
            "daycare": round(daycare_score, 2),
            "preHospitalization": round(pre_hospital_score, 2),
            "postHospitalization": round(post_hospital_score, 2)
        }
    }
}


@app.post("/recommend")
def recommend(request: RecommendationRequest):
    requirements = request.userRequirements
    recommendations = []

    for policy in request.policies:

        # Calculate recommendation score
        score_result = calculate_policy_score(
        policy,
        requirements
    )

        # None means policy does not meet required coverage
        if score_result is None:
            continue

        matched_coverage = get_matched_coverage(
            policy.get("coverageAmounts", []),
            requirements.requiredCoverage
        )

        recommendations.append({
        "policyId": str(policy.get("_id", "")),
        "insuranceCompany": policy.get("insuranceCompany"),
        "policyName": policy.get("policyName"),
        "matchedCoverage": matched_coverage,
        "score": score_result["totalScore"],
        "scoreBreakdown": score_result["breakdown"],
        "purchaseUrl": policy.get("purchaseUrl", "")
    })

    # Highest score first
    recommendations.sort(
        key=lambda item: item["score"],
        reverse=True
    )

    return {
        "recommendations": recommendations[:5]
    }



def extract_basic_policy_info(text: str):
    insurance_company = ""
    policy_name = ""
    initial_waiting_days = 0

    # Insurance company
    company_match = re.search(
        r"([A-Za-z][A-Za-z &.-]+Insurance Company Limited)",
        text,
        re.IGNORECASE
    )

    if company_match:
        insurance_company = company_match.group(1).strip()

    # Policy name
    policy_match = re.search(
        r"SAMPOORNA AROGYA\s*-\s*GROUP",
        text,
        re.IGNORECASE
    )

    if policy_match:
        policy_name = policy_match.group(0).strip()

    # Initial waiting period
    initial_waiting_match = re.search(
        r"Initial\s+waiting\s+period\s*:\s*(\d+)\s*days",
        text,
        re.IGNORECASE
    )

    if initial_waiting_match:
        initial_waiting_days = int(
            initial_waiting_match.group(1)
        )

    specific_illness_months = 0

    specific_waiting_match = re.search(
        r"Specific\s+waiting\s+period\s*:\s*(\d+)\s*months",
        text,
        re.IGNORECASE
    )

    if specific_waiting_match:
        specific_illness_months = int(
            specific_waiting_match.group(1)
        )

    # -------------------------------------------------
    # Specific illness / procedure waiting-period list
    # -------------------------------------------------

    specific_illness_conditions = []

    # Find the detailed clause containing the actual
    # disease/procedure list. We intentionally use a
    # bounded text window because PDF extraction may
    # interleave headers and other page content.
    list_marker_match = re.search(
        r"List\s+of\s+Diseases\s+excluded\s+for\s+"
        r"(\d+)\s+months\s*:",
        text,
        re.IGNORECASE
    )

    if list_marker_match:
        list_waiting_months = int(
            list_marker_match.group(1)
        )

        # Prefer the waiting period attached directly
        # to the detailed disease list.
        specific_illness_months = list_waiting_months

        start_index = list_marker_match.end()

        remaining_text = text[start_index:]

        # Find the next major exclusion clause so that
        # extraction does not continue into unrelated
        # exclusions such as Rest Cure, Obesity, etc.
        end_match = re.search(
            r"\b2\.\s*Rest\s+Cure,\s*"
            r"rehabilitation\s+and\s+respite\s+care",
            remaining_text,
            re.IGNORECASE
        )

        if end_match:
            section = remaining_text[
                :end_match.start()
            ]
        else:
            # Safety fallback if the next heading cannot
            # be detected in a different PDF layout.
            section = remaining_text[:12000]
                    # Normalize PDF line breaks and repeated spaces.
        section = re.sub(
            r"\s+",
            " ",
            section
        ).strip()

        # pypdf may interleave the page's EXCLUSIONS
        # heading and Investigation & Evaluation clause
        # before the first waiting-period condition.
        # Remove that injected text while preserving
        # the first actual condition.
        first_condition_match = re.search(
            r"Any\s+types\s+of\s+gastric\s+or\s+duodenal\s+ulcers",
            section,
            re.IGNORECASE
        )

        if first_condition_match:
            section = section[
                first_condition_match.start():
            ]

        # Remove roman-number list markers where pypdf
        # has preserved them.
        section = re.sub(
            r"(?<![A-Za-z])"
            r"(?:xviii|xvii|xvi|xv|xiv|xiii|xii|xi|"
            r"x|ix|viii|vii|vi|v|iv|iii|ii|i)"
            r"\.\s*",
            " ",
            section,
            flags=re.IGNORECASE
        )

        # Normalize whitespace again after removing
        # list-number markers.
        section = re.sub(
            r"\s+",
            " ",
            section
        ).strip()

        # The detailed policy list separates most
        # disease/procedure groups using semicolons.
        raw_conditions = section.split(";")

        for condition in raw_conditions:
            condition = re.sub(
                r"\s+",
                " ",
                condition
            ).strip(" .,:;-")

            # Ignore empty or obviously invalid fragments.
            if len(condition) < 3:
                continue

            specific_illness_conditions.append(
                condition
            )
            
    pre_existing_disease_months = 0

    ped_waiting_match = re.search(
        r"Pre-\s*Existing\s+disease\s*-\s*(\d+)\s*months",
        text,
        re.IGNORECASE
    )

    if ped_waiting_match:
        pre_existing_disease_months = int(
            ped_waiting_match.group(1)
        )

    room_rent_percentage = 0

    room_rent_match = re.search(
        r"Room\s+Rent,\s*Boarding\s*&\s*Nursing\s+Charges\s*\(\s*(\d+(?:\.\d+)?)\s*%\s*of\s+Sum\s+Insured",
        text,
        re.IGNORECASE
    )

    if room_rent_match:
        room_rent_percentage = float(
            room_rent_match.group(1)
        )

    inpatient_covered = False
    minimum_hospitalization_hours = 0
    daycare_treatments_covered = False

    # Inpatient hospitalization
    inpatient_match = re.search(
        r"stays\s+for\s+at\s+least\s+(\d+)\s+hours",
        text,
        re.IGNORECASE
    )

    if inpatient_match:
        inpatient_covered = True
        minimum_hospitalization_hours = int(
            inpatient_match.group(1)
        )

    # Day care coverage
    daycare_match = re.search(
        r"I\.A\.5\s*-\s*DAY\s+CARE\s+SURGERY/PROCEDURES",
        text,
        re.IGNORECASE
    )

    if daycare_match:
        daycare_treatments_covered = True

    major_exclusions = []

    exclusion_patterns = [
        r"Obesity/\s*Weight\s*Control",
        r"Change-of-Gender\s+treatments",
        r"Cosmetic\s+or\s+plastic\s+Surgery",
        r"Hazardous\s+or\s+Adventure\s+sports",
        r"Breach\s+of\s+law",
        r"Excluded\s+Providers",
        r"Sterility\s+and\s+Infertility",
        r"Maternity"
    ]

    for pattern in exclusion_patterns:
        match = re.search(
            pattern,
            text,
            re.IGNORECASE
        )

        if match:
            major_exclusions.append(
                match.group(0).strip()
            )

    sub_limits = []

    sub_limit_patterns = [
        (
            "Room Rent, Boarding & Nursing",
            r"Rent,\s*Boarding\s*&\s*Nursing\s+Charges\s*\(\s*(\d+(?:\.\d+)?)\s*%\s*of\s+Sum\s+Insured"
        ),
        (
            "Ambulance Charges",
            r"Ambulance\s+Charges.*?up\s+to\s+(\d+(?:\.\d+)?)\s*%\s*of\s+Sum\s+Insured"
        ),
        (
            "Domiciliary Hospitalisation",
            r"Domiciliary\s+Hospitalisation.*?up\s+to\s+(\d+(?:\.\d+)?)\s*%\s*of\s+Sum\s+Insured"
        ),
        (
            "Internal Congenital Diseases",
            r"Internal\s+Congenital\s+Diseases.*?(\d+(?:\.\d+)?)\s*%\s*of\s+Sum\s+Insured"
        ),
        (
            "Advanced Treatments",
            r"Advanced\s+Treatments.*?(\d+(?:\.\d+)?)\s*%\s*of\s+Sum\s+Insured"
        ),
        (
            "Outpatient Expenses",
            r"Outpatient\s+Expenses.*?(\d+(?:\.\d+)?)\s*%\s*of\s+Sum\s+Insured"
        ),
        (
            "Funeral Expenses",
            r"Funeral\s+Expenses.*?(\d+(?:\.\d+)?)\s*%\s*of\s+Sum\s+Insured"
        )
    ]

    for category, pattern in sub_limit_patterns:
        match = re.search(
            pattern,
            text,
            re.IGNORECASE | re.DOTALL
        )

        if match:
            sub_limits.append({
                "category": category,
                "limitType": "Percentage",
                "limitPercentage": float(match.group(1)),
                "limitAmount": 0,
                "description": match.group(0).strip()
            })

    return {
        "insuranceCompany": insurance_company,
        "policyName": policy_name,
        "waitingPeriods": {
            "initialDays": initial_waiting_days,
            "specificIllnessesMonths": specific_illness_months,
            "specificIllnessConditions": specific_illness_conditions,
            "preExistingDiseasesMonths": pre_existing_disease_months
        },
        "roomRentLimit": {
            "hasCap": room_rent_percentage > 0,
            "percentageOfSumInsured": room_rent_percentage
        },
        "hospitalizationCoverage": {
            "inpatientCovered": inpatient_covered,
            "minimumHospitalizationHours": minimum_hospitalization_hours,
            "daycareTreatmentsCovered": daycare_treatments_covered
        },
        "majorExclusions": major_exclusions,
        "subLimits": sub_limits

    }


@app.post("/extract-policy-text")
async def extract_policy_text(
    policyDocument: UploadFile = File(...)
):
    if policyDocument.content_type != "application/pdf":
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are allowed"
        )

    try:
        pdf_bytes = await policyDocument.read()

        # ------------------------------------------
        # 1. DIRECT PDF TEXT EXTRACTION
        # ------------------------------------------

        reader = PdfReader(BytesIO(pdf_bytes))

        extracted_pages = []

        for page in reader.pages:
            page_text = page.extract_text()

            if page_text:
                extracted_pages.append(page_text)

        extracted_text = "\n".join(
            extracted_pages
        ).strip()

        extraction_method = "PDF Text"

        # ------------------------------------------
        # 2. OCR FALLBACK
        # ------------------------------------------

        if len(extracted_text) < 100:

            images = convert_from_bytes(
                pdf_bytes,
                dpi=200
            )

            ocr_pages = []

            for image in images:
                page_text = pytesseract.image_to_string(
                    image,
                    lang="eng"
                )

                if page_text.strip():
                    ocr_pages.append(page_text)

            extracted_text = "\n".join(
                ocr_pages
            ).strip()

            extraction_method = "OCR"

        # ------------------------------------------
        # 3. VERIFY EXTRACTION
        # ------------------------------------------

        if len(extracted_text) < 100:
            raise HTTPException(
                status_code=422,
                detail=(
                    "Unable to extract sufficient text "
                    "from the policy document."
                )
            )

        # ------------------------------------------
        # 4. POLICY RULE EXTRACTION
        # ------------------------------------------

        basic_policy_info = extract_basic_policy_info(
            extracted_text
        )

        return {
            "fileName": policyDocument.filename,
            "pageCount": len(reader.pages),
            "extractedText": extracted_text,
            "characterCount": len(extracted_text),
            "extractionMethod": extraction_method,
            "requiresOcr": extraction_method == "OCR",
            "extractedPolicyData": basic_policy_info
        }

    except HTTPException:
        raise

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=(
                f"Failed to extract PDF text: {str(error)}"
            )
        )