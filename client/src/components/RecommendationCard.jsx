import { useState } from "react";
import { useNavigate } from "react-router-dom";

function RecommendationCard({ recommendation, rank }) {
  const navigate = useNavigate();
  const [showBreakdown, setShowBreakdown] = useState(false);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const breakdown = recommendation.scoreBreakdown;

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
      </div>

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
                {breakdown.waitingPeriods.score} / 10
              </span>
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