import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import "./PolicyDetails.css";

function PolicyDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [policy, setPolicy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchPolicy = async () => {
      try {
        const response = await axios.get(`/api/policies/${id}`);
        setPolicy(response.data.policy);
      } catch (error) {
        console.error("Error fetching policy:", error);

        if (error.response?.status === 404) {
          setError("Policy not found.");
        } else if (error.response?.status === 400) {
          setError("Invalid policy ID.");
        } else {
          setError("Failed to load policy.");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchPolicy();
  }, [id]);

  if (loading) {
    return <p>Loading policy details...</p>;
  }

  if (error) {
    return <p>{error}</p>;
  }

  if (!policy) {
    return <p>Policy not found.</p>;
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="policy-details-page">

      {/* Back Button */}
      <button
        type="button"
        className="policy-back-button"
        onClick={() => navigate("/policies")}
      >
        ← Back to Policies
      </button>

      {/* Header */}
      <div className="policy-details-header">
        <h1>{policy.policyName}</h1>
        <h3>{policy.insuranceCompany}</h3>
      </div>

      {/* Details Grid */}
      <div className="policy-details-grid">

        {/* Policy Overview */}
        <section className="policy-detail-section">
          <h2>Policy Overview</h2>

          <p>
            <strong>Policy Type:</strong>{" "}
            {policy.policyType.join(", ")}
          </p>

          <p>
            <strong>Coverage Options:</strong>{" "}
            {policy.coverageAmounts
              .map((amount) => formatCurrency(amount))
              .join(", ")}
          </p>
        </section>

        {/* Eligibility */}
        <section className="policy-detail-section">
          <h2>Eligibility</h2>

          <p>
            <strong>Minimum Age:</strong>{" "}
            {policy.eligibility.minAge} years
          </p>

          <p>
            <strong>Maximum Age:</strong>{" "}
            {policy.eligibility.maxAge} years
          </p>

          <p>
            <strong>Family Floater:</strong>{" "}
            {policy.eligibility.familyFloaterAllowed
              ? "Allowed"
              : "Not Allowed"}
          </p>
        </section>

        {/* Waiting Periods */}
        <section className="policy-detail-section">
          <h2>Waiting Periods</h2>

          <p>
            <strong>Initial Waiting Period:</strong>{" "}
            {policy.waitingPeriods.initialDays} days
          </p>

          <p>
            <strong>Specific Illnesses:</strong>{" "}
            {policy.waitingPeriods.specificIllnessesMonths} months
          </p>

          <p>
            <strong>Pre-existing Diseases:</strong>{" "}
            {policy.waitingPeriods.preExistingDiseasesMonths} months
          </p>

          {policy.waitingPeriods.description && (
            <p>{policy.waitingPeriods.description}</p>
          )}
        </section>

        {/* Hospitalization Coverage */}
        <section className="policy-detail-section">
          <h2>Hospitalization Coverage</h2>

          <p>
            <strong>Inpatient Coverage:</strong>{" "}
            {policy.hospitalizationCoverage.inpatientCovered
              ? "Yes"
              : "No"}
          </p>

          <p>
            <strong>Minimum Hospitalization:</strong>{" "}
            {
              policy.hospitalizationCoverage
                .minimumHospitalizationHours
            }{" "}
            hours
          </p>

          <p>
            <strong>Daycare Treatments:</strong>{" "}
            {policy.hospitalizationCoverage.daycareTreatmentsCovered
              ? "Covered"
              : "Not Covered"}
          </p>

          <p>
            <strong>Pre-Hospitalization:</strong>{" "}
            {policy.hospitalizationCoverage.preHospitalizationDays}{" "}
            days
          </p>

          <p>
            <strong>Post-Hospitalization:</strong>{" "}
            {policy.hospitalizationCoverage.postHospitalizationDays}{" "}
            days
          </p>
        </section>

        {/* Room Rent */}
        <section className="policy-detail-section">
          <h2>Room Rent</h2>

          <p>
            <strong>Room Restriction:</strong>{" "}
            {policy.roomRentLimit.hasCap ? "Yes" : "No"}
          </p>

          <p>
            <strong>Room Type:</strong>{" "}
            {policy.roomRentLimit.roomTypeAllowed}
          </p>

          {policy.roomRentLimit.percentageOfSumInsured > 0 && (
            <p>
              <strong>Room Limit:</strong>{" "}
              {policy.roomRentLimit.percentageOfSumInsured}% of Sum
              Insured
            </p>
          )}

          {policy.roomRentLimit.maxPerDay > 0 && (
            <p>
              <strong>Maximum Per Day:</strong>{" "}
              {formatCurrency(policy.roomRentLimit.maxPerDay)}
            </p>
          )}
        </section>

        {/* Co-payment & Deductible */}
        <section className="policy-detail-section">
          <h2>Co-payment & Deductible</h2>

          <p>
            <strong>Co-payment:</strong>{" "}
            {policy.coPaymentPercentage}%
          </p>

          <p>
            <strong>Deductible:</strong>{" "}
            {formatCurrency(policy.deductibleAmount)}
          </p>
        </section>

        {/* Pre-existing Disease Rules */}
        <section className="policy-detail-section policy-detail-full">
          <h2>Pre-existing Disease Rules</h2>

          {policy.preExistingConditionsRules.length > 0 ? (
            <ul>
              {policy.preExistingConditionsRules.map(
                (rule, index) => (
                  <li key={index}>{rule}</li>
                )
              )}
            </ul>
          ) : (
            <p>No specific PED rules listed.</p>
          )}
        </section>

        {/* Sub-Limits */}
        <section className="policy-detail-section policy-detail-full">
          <h2>Sub-Limits</h2>

          {policy.subLimits.length > 0 ? (
            policy.subLimits.map((limit, index) => (
              <div key={index}>
                <strong>{limit.category}</strong>

                {limit.limitAmount != null && (
                  <p>
                    Limit: {formatCurrency(limit.limitAmount)}
                  </p>
                )}

                {limit.limitPercentage != null && (
                  <p>
                    Limit: {limit.limitPercentage}%
                  </p>
                )}

                {limit.description && (
                  <p>{limit.description}</p>
                )}
              </div>
            ))
          ) : (
            <p>No specific sub-limits listed.</p>
          )}
        </section>

        {/* Major Exclusions */}
        <section className="policy-detail-section policy-detail-full">
          <h2>Major Exclusions</h2>

          {policy.majorExclusions.length > 0 ? (
            <ul>
              {policy.majorExclusions.map(
                (exclusion, index) => (
                  <li key={index}>{exclusion}</li>
                )
              )}
            </ul>
          ) : (
            <p>No major exclusions listed.</p>
          )}
        </section>

        {/* Important Conditions */}
        <section className="policy-detail-section policy-detail-full">
          <h2>Important Conditions</h2>

          {policy.importantConditions.length > 0 ? (
            <ul>
              {policy.importantConditions.map(
                (condition, index) => (
                  <li key={index}>{condition}</li>
                )
              )}
            </ul>
          ) : (
            <p>No additional conditions listed.</p>
          )}
        </section>

        {/* Official Policy Document */}
        {policy.documentUrl && (
          <section className="policy-detail-section policy-detail-full">
            <h2>Policy Document</h2>

            <p>
              View the official policy document for complete terms,
              conditions, coverage information, and exclusions.
            </p>

            <a
              href={policy.documentUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              View Official Policy Document
            </a>
          </section>
        )}

      </div>
    </div>
  );
}

export default PolicyDetails;