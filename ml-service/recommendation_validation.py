"""Validation boundaries; recommendation scoring remains in main.py."""
import math
from typing import Annotated, Literal, Optional
from pydantic import BaseModel, Field, StrictBool, field_validator

PositiveAmount = Annotated[float, Field(gt=0, allow_inf_nan=False, strict=True)]
NonnegativeAmount = Annotated[float, Field(ge=0, allow_inf_nan=False, strict=True)]
DiseaseName = Annotated[str, Field(min_length=1, max_length=200, strict=True)]


class InsuredMember(BaseModel):
    memberType: Literal["Self", "FamilyMember"]
    relationship: Optional[Annotated[str, Field(max_length=100, strict=True)]] = None
    age: Optional[Annotated[int, Field(ge=0, le=120, strict=True)]] = None
    isDependent: Optional[StrictBool] = None


class UserRequirements(BaseModel):
    requiredCoverage: PositiveAmount
    coverageType: Literal["Individual", "Family Floater"]
    age: Annotated[int, Field(ge=0, le=120, strict=True)]
    gender: Literal["male", "female", "other"]
    city: Annotated[str, Field(min_length=1, max_length=100, strict=True)]
    annualIncome: Optional[NonnegativeAmount] = None
    budget: Optional[PositiveAmount] = None
    insuredMembers: list[InsuredMember] = Field(default_factory=list, max_length=101)
    preExistingDiseases: list[DiseaseName] = Field(default_factory=list, max_length=100)
    isSmokerOrTobaccoUser: StrictBool = False
    alcoholConsumption: Literal["Never", "Occasional", "Regular"] = "Never"
    hasHighRiskOccupation: StrictBool = False
    coPaymentPreference: Annotated[float, Field(ge=0, le=100, allow_inf_nan=False, strict=True)] = 0
    roomRentPreference: Literal["No Restriction", "Flexible"] = "No Restriction"

    @field_validator("city")
    @classmethod
    def valid_city(cls, value):
        if not value.strip():
            raise ValueError("City is required")
        return value.strip()

    @field_validator("preExistingDiseases", mode="before")
    @classmethod
    def valid_diseases(cls, value):
        if not isinstance(value, list) or len(value) > 100 or any(not isinstance(item, str) or not item.strip() for item in value):
            raise ValueError("Diseases must be an array of nonempty names")
        return list(dict.fromkeys(item.strip() for item in value))


def valid_scoring_policy(policy):
    def finite(value, maximum=math.inf):
        return type(value) in (int, float) and math.isfinite(value) and 0 <= value <= maximum

    if any(not isinstance(policy.get(key), str) or not policy[key].strip() for key in ("policyName", "insuranceCompany")):
        return False
    types = policy.get("policyType")
    coverage = policy.get("coverageAmounts")
    eligibility = policy.get("eligibility")
    if not isinstance(types, list) or not types or any(item not in ("Individual", "Family Floater", "Senior Citizen", "Critical Illness") for item in types):
        return False
    if not isinstance(coverage, list) or not coverage or any(not finite(value) or value <= 0 for value in coverage):
        return False
    if eligibility is not None:
        if not isinstance(eligibility, dict):
            return False
        for field in ("minAge", "maxAge"):
            if eligibility.get(field) is not None and not finite(eligibility[field], 120):
                return False
        if eligibility.get("minAge") is not None and eligibility.get("maxAge") is not None and eligibility["minAge"] > eligibility["maxAge"]:
            return False
        if eligibility.get("familyFloaterAllowed") is not None and type(eligibility["familyFloaterAllowed"]) is not bool:
            return False
    waiting, room, hospital = (policy.get(key) for key in ("waitingPeriods", "roomRentLimit", "hospitalizationCoverage"))
    if not all(isinstance(value, dict) for value in (waiting, room, hospital)):
        return False
    if any(not finite(waiting.get(key)) for key in ("initialDays", "specificIllnessesMonths", "preExistingDiseasesMonths")):
        return False
    if type(room.get("hasCap")) is not bool or not isinstance(room.get("roomTypeAllowed", "No Restriction"), str):
        return False
    if any(type(hospital.get(key)) is not bool for key in ("inpatientCovered", "daycareTreatmentsCovered")):
        return False
    if any(not finite(hospital.get(key, 0)) for key in ("minimumHospitalizationHours", "preHospitalizationDays", "postHospitalizationDays")):
        return False
    return finite(policy.get("coPaymentPercentage"), 100)


class RecommendationRequest(BaseModel):
    userRequirements: UserRequirements
    policies: list[dict]

    @field_validator("policies")
    @classmethod
    def valid_policies(cls, value):
        if any(not valid_scoring_policy(policy) for policy in value):
            raise ValueError("Policy scoring data is missing or invalid")
        return value
