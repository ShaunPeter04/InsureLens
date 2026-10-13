import { useNavigate } from "react-router-dom";

function PolicyCard({ policy }) {
  const navigate = useNavigate();

  const coverageAmounts = Array.isArray(policy?.coverageAmounts)
    ? policy.coverageAmounts.filter(
        (amount) => typeof amount === "number" && Number.isFinite(amount)
      )
    : [];

  const minCoverage =
    coverageAmounts.length > 0
      ? Math.min(...coverageAmounts)
      : null;

  const maxCoverage =
    coverageAmounts.length > 0
      ? Math.max(...coverageAmounts)
      : null;

  const formatCurrency = (amount) => {
    if (amount === null || amount === undefined) {
      return "Not available";
    }

    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const policyTypes = Array.isArray(policy?.policyType)
    ? policy.policyType.join(", ")
    : "Not available";

  const initialWaitingPeriod =
    policy?.waitingPeriods?.initialDays ?? null;

  const pedWaitingPeriod =
    policy?.waitingPeriods?.preExistingDiseasesMonths ?? null;

  const roomType =
    policy?.roomRentLimit?.roomTypeAllowed || "Not available";

  const coPayment =
    policy?.coPaymentPercentage ?? null;

  return (
    <div className="policy-card">
      <h2>{policy?.policyName || "Unnamed Policy"}</h2>

      <p>
        <strong>Insurer:</strong>{" "}
        {policy?.insuranceCompany || "Not available"}
      </p>

      <p>
        <strong>Policy Type:</strong>{" "}
        {policyTypes}
      </p>

      <p>
        <strong>Coverage:</strong>{" "}
        {coverageAmounts.length > 0
          ? `${formatCurrency(minCoverage)} - ${formatCurrency(maxCoverage)}`
          : "Not available"}
      </p>

      <p>
        <strong>Initial Waiting Period:</strong>{" "}
        {initialWaitingPeriod !== null
          ? `${initialWaitingPeriod} days`
          : "Not available"}
      </p>

      <p>
        <strong>PED Waiting Period:</strong>{" "}
        {pedWaitingPeriod !== null
          ? `${pedWaitingPeriod} months`
          : "Not available"}
      </p>

      <p>
        <strong>Room:</strong>{" "}
        {roomType}
      </p>

      <p>
        <strong>Co-pay:</strong>{" "}
        {coPayment !== null
          ? `${coPayment}%`
          : "Not available"}
      </p>

      <button
        type="button"
        onClick={() => {
          if (policy?._id) {
            navigate(`/policies/${policy._id}`);
          }
        }}
        disabled={!policy?._id}
      >
        View Details
      </button>
    </div>
  );
}

export default PolicyCard;