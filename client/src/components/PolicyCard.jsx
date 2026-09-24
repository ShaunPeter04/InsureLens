import { useNavigate } from "react-router-dom";

function PolicyCard({ policy }) {
  const navigate = useNavigate();

  const minCoverage = Math.min(...policy.coverageAmounts);
  const maxCoverage = Math.max(...policy.coverageAmounts);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="policy-card">

      <h2>{policy.policyName}</h2>

      <p>
        <strong>Insurer:</strong> {policy.insuranceCompany}
      </p>

      <p>
        <strong>Policy Type:</strong>{" "}
        {policy.policyType.join(", ")}
      </p>

      <p>
        <strong>Coverage:</strong>{" "}
        {formatCurrency(minCoverage)} - {formatCurrency(maxCoverage)}
      </p>

      <p>
        <strong>Initial Waiting Period:</strong>{" "}
        {policy.waitingPeriods.initialDays} days
      </p>

      <p>
        <strong>PED Waiting Period:</strong>{" "}
        {policy.waitingPeriods.preExistingDiseasesMonths} months
      </p>

      <p>
        <strong>Room:</strong>{" "}
        {policy.roomRentLimit.roomTypeAllowed}
      </p>

      <p>
        <strong>Co-pay:</strong>{" "}
        {policy.coPaymentPercentage}%
      </p>

      <button
        type="button"
        onClick={() => navigate(`/policies/${policy._id}`)}
      >
        View Details
      </button>

    </div>
  );
}

export default PolicyCard;