import { useRef, useState } from "react";
import { validateSavedPolicy } from "../utils/insuranceValidation";
import { useNavigate } from "react-router-dom";

function RecommendationCard({
  recommendation,
  rank,
  onAddPolicy,
}) {
  const navigate = useNavigate();
  const saving = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showAddPolicy, setShowAddPolicy] = useState(false);

  const [policyForm, setPolicyForm] = useState({
    selectedCoverage: recommendation.matchedCoverage || "",
    policyNumber: "",
    policyStartDate: "",
    policyEndDate: "",
  });

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const breakdown = recommendation.scoreBreakdown;

  const handleChange = (event) => {
    const { name, value } = event.target;

    setPolicyForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleAddPolicy = async (event) => {
    event.preventDefault();

    if (saving.current) return;
    const { error: validationError, data } = validateSavedPolicy({ ...policyForm, policyId: recommendation.policyId });
    setError(validationError || "");
    if (validationError) return;
    saving.current = true;
    setIsSaving(true);
    try {
      const success = await onAddPolicy(data);
      if (success) {
        setShowAddPolicy(false);
        setPolicyForm({ selectedCoverage: recommendation.matchedCoverage || "", policyNumber: "", policyStartDate: "", policyEndDate: "" });
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save policy.");
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  };

  return (
    <div className="recommendation-card">

      {/* POLICY INFORMATION */}
      <div className="recommendation-card-header">
        <span>#{rank}</span>

        <h2>{recommendation.policyName}</h2>

        <p>{recommendation.insuranceCompany}</p>
      </div>

      {/* MATCH INFORMATION */}
      <div className="recommendation-card-match">
        <p>
          <strong>Matched Coverage:</strong>{" "}
          {formatCurrency(recommendation.matchedCoverage)}
        </p>

        <p>
          <strong>Match Score:</strong>{" "}
          {recommendation.score} / 100
        </p>
      </div>

      {recommendation.premiumAssessment && (
        <div className="recommendation-card-match">
          <p><strong>Budget check:</strong> {recommendation.premiumAssessment.status}</p>
          {recommendation.premiumAssessment.budget !== null && (
            <p><strong>Your annual budget:</strong> {formatCurrency(recommendation.premiumAssessment.budget)}</p>
          )}
          {recommendation.premiumAssessment.annualPremium !== null && (
            <p><strong>Verified annual premium:</strong> {formatCurrency(recommendation.premiumAssessment.annualPremium)}</p>
          )}
          {recommendation.premiumAssessment.basePremium !== null && (
            <p><strong>Catalog base premium:</strong> {formatCurrency(recommendation.premiumAssessment.basePremium)} (pricing period unverified)</p>
          )}
          <p>{recommendation.premiumAssessment.message}</p>
        </div>
      )}

      {recommendation.familyEligibility && (
        <div className="recommendation-card-match">
          <p><strong>Family eligibility:</strong> {recommendation.familyEligibility.status}</p>
          <p>{recommendation.familyEligibility.message}</p>
          {recommendation.familyEligibility.members.map((member, index) => (
            <p key={index}>
              <strong>{member.relationship || "Selected member"}{member.age !== null ? `, age ${member.age}` : ""}:</strong>{" "}
              {member.ageStatus}. {member.message} Relationship eligibility: {member.relationshipStatus}.
            </p>
          ))}
        </div>
      )}

      {/* ACTIONS */}
      <div className="recommendation-card-actions">
        <button
          type="button"
          onClick={() => setShowBreakdown((prev) => !prev)}
        >
          {showBreakdown
            ? "Hide Score Breakdown"
            : "View Score Breakdown"}
        </button>

        <button
          type="button"
          onClick={() =>
            navigate(`/policies/${recommendation.policyId}`)
          }
        >
          View Policy Details
        </button>
        {recommendation.purchaseUrl && (
          <button
            type="button"
            onClick={() =>
              window.open(
                recommendation.purchaseUrl,
                "_blank",
                "noopener,noreferrer"
              )
            }
          >
            Visit Insurer / Buy
          </button>
        )}

        <button
          type="button"
          disabled={isSaving}
          onClick={() => setShowAddPolicy((prev) => !prev)}
        >
          {showAddPolicy
            ? "Cancel"
            : "Add to My Policies"}
        </button>
      </div>

      {/* ADD POLICY FORM */}
      {showAddPolicy && (
        <form
          className="add-policy-form"
          onSubmit={handleAddPolicy}
          noValidate
          aria-busy={isSaving}
        >
          <h3>Add to My Policies</h3>

          <label>
            Selected Coverage
            <input
              type="text"
              value={formatCurrency(
                Number(policyForm.selectedCoverage)
              )}
              disabled
            />
          </label>

          <label>
            Policy Number
            <input
              type="text"
              name="policyNumber"
              value={policyForm.policyNumber}
              onChange={handleChange}
              placeholder="Enter policy number"
            />
          </label>

          <label>
            Policy Start Date
            <input
              type="date"
              name="policyStartDate"
              value={policyForm.policyStartDate}
              onChange={handleChange}
              required
            />
          </label>

          <label>
            Policy End Date
            <input
              type="date"
              name="policyEndDate"
              value={policyForm.policyEndDate}
              onChange={handleChange}
              required
            />
          </label>

          {error && <p className="recommendation-error" role="alert">{error}</p>}
          <button type="submit" disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Policy"}
          </button>
        </form>
      )}

      {/* SCORE BREAKDOWN */}
      {showBreakdown && (
        <div className="score-breakdown">
          <h3>Score Breakdown</h3>

          <p>
            Coverage
            <span>{breakdown.coverage} / 30</span>
          </p>

          <p>
            Co-payment
            <span>{breakdown.coPayment} / 15</span>
          </p>

          <p>
            Room Rent
            <span>{breakdown.roomRent} / 15</span>
          </p>

          {breakdown.preExistingDisease?.applicable && (
            <p>
              Pre-existing Disease
              <span>
                {breakdown.preExistingDisease.score} / 15
              </span>
            </p>
          )}

          <div className="breakdown-group">
            <p>
              <strong>Waiting Periods</strong>

              <span>
                {breakdown.waitingPeriods.score} / 10</span>
            </p>

            <p className="breakdown-subitem">
              Initial Waiting
              <span>
                {breakdown.waitingPeriods.initialWaiting} / 5
              </span>
            </p>

            <p className="breakdown-subitem">
              Specific Illness Waiting
              <span>
                {breakdown.waitingPeriods.specificIllnessWaiting} / 5
              </span>
            </p>
          </div>

          <div className="breakdown-group">
            <p>
              <strong>Hospitalization</strong>
              <span>
                {breakdown.hospitalization.score} / 15
              </span>
            </p>

            <p className="breakdown-subitem">
              Inpatient Coverage
              <span>
                {breakdown.hospitalization.inpatient} / 5
              </span>
            </p>

            <p className="breakdown-subitem">
              Daycare Coverage
              <span>
                {breakdown.hospitalization.daycare} / 3
              </span>
            </p>

            <p className="breakdown-subitem">
              Pre-Hospitalization
              <span>
                {breakdown.hospitalization.preHospitalization} / 3
              </span>
            </p>

            <p className="breakdown-subitem">
              Post-Hospitalization
              <span>
                {breakdown.hospitalization.postHospitalization} / 4
              </span>
            </p>
          </div>
        </div>
      )}

    </div>
  );
}

export default RecommendationCard;