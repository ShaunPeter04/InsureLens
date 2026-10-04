import { useEffect, useState } from "react";
import axios from "axios";
import "./Claimability.css";

function Claimability() {
  const [userPolicies, setUserPolicies] = useState([]);
  const [familyMembers, setFamilyMembers] = useState([]);
  const [loadingPolicies, setLoadingPolicies] =
    useState(true);

  const [formData, setFormData] = useState({
    userPolicy: "",
    patientType: "Self",
    familyMember: "",
    hospitalName: "",
    hospitalizationType: "Inpatient",
    admissionDate: "",
    admissionTime: "",
    dischargeDate: "",
    dischargeTime: "",
    diagnosis: "",
    treatment: "",
    totalBillAmount: "",
    roomRentPerDay: "",
    roomType: "",
    isPlannedHospitalization: false,
    isEmergency: false,
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [analysisResult, setAnalysisResult] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
        try {
        const [policiesResponse, familyResponse] =
            await Promise.all([
            axios.get("/api/user-policies"),
            axios.get("/api/family-members"),
            ]);

        const policies =
            policiesResponse.data.userPolicies || [];
            

        const members =
            familyResponse.data.familyMembers || [];

        setUserPolicies(policies);
        setFamilyMembers(members);

        if (policies.length > 0) {
            setFormData((prev) => ({
            ...prev,
            userPolicy: policies[0]._id,
            }));
        }
        } catch (err) {
        console.error(
            "Failed to load claimability data:",
            err
        );

        setError(
            err.response?.data?.message ||
            "Failed to load your policy information."
        );
        } finally {
        setLoadingPolicies(false);
        }
    };

    fetchData();
    }, []
);

  const handleChange = (e) => {
    const { name, value, type, checked } =
      e.target;

    setFormData((prev) => ({
      ...prev,
      [name]:
        type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setSubmitting(true);
      setError("");
      setSuccess("");
      setAnalysisResult(null);

      const payload = {
        ...formData,

        totalBillAmount: Number(
          formData.totalBillAmount
        ),

        roomRentPerDay: Number(
          formData.roomRentPerDay || 0
        ),
      };

        const response = await axios.post(
        "/api/claim-cases",
        payload
        );

        const createdCase = response.data.claimCase;

        const analysisResponse = await axios.get(
        `/api/claim-cases/${createdCase._id}/analyze`
        );

        console.log(
        "Claimability Analysis:",
        analysisResponse.data
        );

        setAnalysisResult(analysisResponse.data);

        setSuccess(
        "Hospitalization case created and analyzed successfully."
        );    
    } catch (err) {
            console.error(
                "Create claim case error:",
                err
            );

      setError(
        err.response?.data?.message ||
          "Failed to create hospitalization case."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingPolicies) {
    return (
      <div className="claimability-page">
        <p>Loading your policies...</p>
      </div>
    );
  }

  if (userPolicies.length === 0) {
    return (
      <div className="claimability-page">
        <h1>Claimability Analysis</h1>

        <p>
          Add a health insurance policy to My
          Policies before analyzing a claim.
        </p>
      </div>
    );
  }

  return (
    <div className="claimability-page">
      <h1>Claimability Analysis</h1>

      <p>
        Enter your hospitalization details to
        analyze them against your saved policy.
      </p>

      {error && (
        <p className="claimability-error">
          {error}
        </p>
      )}

      {success && (
        <p className="claimability-success">
          {success}
        </p>
      )}

      <form
        className="claimability-form"
        onSubmit={handleSubmit}
      >
        <div>
          <label htmlFor="userPolicy">
            Policy
          </label>

          <select
            id="userPolicy"
            name="userPolicy"
            value={formData.userPolicy}
            onChange={handleChange}
            required
          >
            {userPolicies.map((item) => {
            const policy =
              item.sourceType === "Uploaded"
                ? item.extractedPolicyData
                : item.policy;

            const policyName =
              policy?.policyName || "Unnamed Policy";

            const insuranceCompany =
              policy?.insuranceCompany ||
              "Unknown Insurer";

            return (
              <option
                key={item._id}
                value={item._id}
              >
                {policyName} - {insuranceCompany}
                {item.policyNumber
                  ? ` (${item.policyNumber})`
                  : ""}
              </option>
            );
          })}
          </select>
        </div>

        <div>
          <label htmlFor="patientType">
            Patient
          </label>

          <select
            id="patientType"
            name="patientType"
            value={formData.patientType}
            onChange={handleChange}
          >
            <option value="Self">
              Self
            </option>

            <option value="Family Member">
              Family Member
            </option>
          </select>
        </div>

        {formData.patientType === "Family Member" && (
        <div>
            <label htmlFor="familyMember">
            Family Member
            </label>

            <select
            id="familyMember"
            name="familyMember"
            value={formData.familyMember}
            onChange={handleChange}
            required
            >
            <option value="">
                Select family member
            </option>

            {familyMembers.map((member) => (
                <option
                key={member._id}
                value={member._id}
                >
                {member.name} - {member.relationship}
                </option>
            ))}
            </select>

            {familyMembers.length === 0 && (
            <p>
                No family members have been added yet.
            </p>
            )}
        </div>
        )}

        <div>
          <label htmlFor="hospitalName">
            Hospital Name
          </label>

          <input
            id="hospitalName"
            name="hospitalName"
            type="text"
            value={formData.hospitalName}
            onChange={handleChange}
            required
          />
        </div>

        <div>
          <label htmlFor="hospitalizationType">
            Hospitalization Type
          </label>

          <select
            id="hospitalizationType"
            name="hospitalizationType"
            value={
              formData.hospitalizationType
            }
            onChange={handleChange}
          >
            <option value="Inpatient">
              Inpatient
            </option>

            <option value="Day Care">
              Day Care
            </option>
          </select>
        </div>

        <div>
          <label htmlFor="admissionDate">
            Admission Date
          </label>

          <input
            id="admissionDate"
            name="admissionDate"
            type="date"
            value={formData.admissionDate}
            onChange={handleChange}
            required
          />
        </div>
        <div>
            <label htmlFor="admissionTime">
                Admission Time
            </label>

            <input
                id="admissionTime"
                name="admissionTime"
                type="time"
                value={formData.admissionTime}
                onChange={handleChange}
                required
            />
        </div>

        <div>
          <label htmlFor="dischargeDate">
            Discharge Date
          </label>

          <input
            id="dischargeDate"
            name="dischargeDate"
            type="date"
            value={formData.dischargeDate}
            onChange={handleChange}
            required
          />
        </div>

        <div>
        <label htmlFor="dischargeTime">
            Discharge Time
        </label>

        <input
            id="dischargeTime"
            name="dischargeTime"
            type="time"
            value={formData.dischargeTime}
            onChange={handleChange}
            required
        />
        </div>

        <div>
          <label htmlFor="diagnosis">
            Diagnosis
          </label>

          <input
            id="diagnosis"
            name="diagnosis"
            type="text"
            value={formData.diagnosis}
            onChange={handleChange}
            required
          />
        </div>

        <div>
          <label htmlFor="treatment">
            Treatment
          </label>

          <input
            id="treatment"
            name="treatment"
            type="text"
            value={formData.treatment}
            onChange={handleChange}
          />
        </div>

        <div>
          <label htmlFor="totalBillAmount">
            Total Bill Amount
          </label>

          <input
            id="totalBillAmount"
            name="totalBillAmount"
            type="number"
            min="0"
            value={formData.totalBillAmount}
            onChange={handleChange}
            required
          />
        </div>

        <div>
          <label htmlFor="roomRentPerDay">
            Room Rent Per Day
          </label>

          <input
            id="roomRentPerDay"
            name="roomRentPerDay"
            type="number"
            min="0"
            value={formData.roomRentPerDay}
            onChange={handleChange}
          />
        </div>

        <div>
          <label htmlFor="roomType">
            Room Type
          </label>

          <input
            id="roomType"
            name="roomType"
            type="text"
            value={formData.roomType}
            onChange={handleChange}
            placeholder="Private Room"
          />
        </div>

        <label>
          <input
            name="isPlannedHospitalization"
            type="checkbox"
            checked={
              formData.isPlannedHospitalization
            }
            onChange={handleChange}
          />

          Planned Hospitalization
        </label>

        <label>
          <input
            name="isEmergency"
            type="checkbox"
            checked={formData.isEmergency}
            onChange={handleChange}
          />

          Emergency Hospitalization
        </label>

        <button
          type="submit"
          disabled={submitting}
        >
          {submitting
            ? "Saving..."
            : "Save Hospitalization Case"}
        </button>
    </form>

    {analysisResult && (
      <section className="claimability-result">
        <div className="claimability-result-header">
          <div>
            <p className="result-label">
              Claimability Assessment
            </p>

            <h2>{analysisResult.policyName}</h2>

            <p className="result-disclaimer">
              This is a rule-based assessment of the policy
              conditions InsureLens can automatically verify.
              It is not a guarantee of claim approval.
            </p>
          </div>

          <div className="score-box">
            <span className="score-number">
              {analysisResult.claimabilityScore}
            </span>

            <span className="score-total">/100</span>

            <strong>{analysisResult.assessment}</strong>
          </div>
        </div>

        {analysisResult.hasBlockingIssues &&
        analysisResult.blockingIssues?.length > 0 && (
          <div className="claim-blockers">
            <strong>Claimability Issues Detected</strong>

            <p>
              The following policy conditions may prevent
              this claim from being payable:
            </p>

            <ul>
              {analysisResult.blockingIssues.map(
                (issue, index) => (
                  <li key={index}>{issue}</li>
                )
              )}
            </ul>
          </div>
        )}

        {analysisResult.requiresManualReview && (
          <div className="manual-review-warning">
            <strong>Manual Review Required</strong>

            <p>
              Some policy clauses require diagnosis or
              treatment-specific review before a final
              claimability conclusion can be made.
            </p>
          </div>
        )}

        <div className="claimability-checks">
          {[
            [
              "Policy Active",
              analysisResult.analysis.policyActive,
            ],
            [
              "Initial Waiting Period",
              analysisResult.analysis.initialWaitingPeriod,
            ],
            [
              "Hospitalization Eligibility",
              analysisResult.analysis.hospitalizationCoverage,
            ],
            [
              "Room Rent",
              analysisResult.analysis.roomRent,
            ],
            [
              "Coverage Amount",
              analysisResult.analysis.coverage,
            ],
          ].map(([title, check]) => (
            <div
              className={`claimability-check-card ${
                check.passed ? "passed" : "failed"
              }`}
              key={title}
            >
              <div className="check-title">
                <span className="check-icon">
                  {check.passed ? "✓" : "✕"}
                </span>

                <h3>{title}</h3>
              </div>

              <p>{check.message}</p>
            </div>
          ))}
        </div>

        <div className="financial-summary">
          <h3>Estimated Financial Impact</h3>

          <div className="financial-grid">
            <div>
              <span>Total Bill</span>
              <strong>
                ₹
                {analysisResult.analysis.coverage.totalBillAmount.toLocaleString(
                  "en-IN"
                )}
              </strong>
            </div>

            <div>
              <span>Co-payment</span>
              <strong>
                ₹
                {analysisResult.analysis.financialImpact.estimatedCoPayment.toLocaleString(
                  "en-IN"
                )}
              </strong>
            </div>

            <div>
              <span>Deductible</span>
              <strong>
                ₹
                {analysisResult.analysis.financialImpact.estimatedDeductible.toLocaleString(
                  "en-IN"
                )}
              </strong>
            </div>

            <div>
              <span>
                Amount After Basic Deductions
              </span>

              <strong>
                ₹
                {analysisResult.analysis.financialImpact.estimatedAmountAfterBasicDeductions.toLocaleString(
                  "en-IN"
                )}
              </strong>
            </div>
          </div>

          <p className="financial-note">
            {
              analysisResult.analysis.financialImpact
                .message
            }
          </p>
        </div>

        <div className="review-section">
          <h3>Policy Clauses Requiring Review</h3>

            {analysisResult.analysis.requiresReview
            .pedWaitingPeriod && (
            <div className="review-block">
              <h4>Pre-existing Disease Waiting Period</h4>

              <p>
                {
                  analysisResult.analysis.requiresReview
                    .pedWaitingPeriod.message
                }
              </p>

              {analysisResult.analysis.requiresReview
                .pedWaitingPeriod.matchedPreExistingDiseases
                ?.length > 0 && (
                <p>
                  <strong>Matched:</strong>{" "}
                  {analysisResult.analysis.requiresReview
                    .pedWaitingPeriod
                    .matchedPreExistingDiseases.join(", ")}
                </p>
              )}
            </div>
          )}

          <div className="review-block">
            <h4>Specific Illness Waiting Period</h4>

            <p>
              {
                analysisResult.analysis.requiresReview
                  .specificIllnessWaitingPeriod.message
              }
            </p>
          </div>

          {analysisResult.analysis.requiresReview
            .preExistingConditionRules.length > 0 && (
            <div className="review-block">
              <h4>Pre-existing Condition Rules</h4>

              <ul>
                {analysisResult.analysis.requiresReview.preExistingConditionRules.map(
                  (item, index) => (
                    <li key={index}>{item}</li>
                  )
                )}
              </ul>
            </div>
          )}

          {analysisResult.analysis.requiresReview
            .majorExclusions.length > 0 && (
            <div className="review-block">
              <h4>Major Exclusions</h4>

              <ul>
                {analysisResult.analysis.requiresReview.majorExclusions.map(
                  (item, index) => (
                    <li key={index}>{item}</li>
                  )
                )}
              </ul>
            </div>
          )}

          {analysisResult.analysis.requiresReview
            .subLimits && (
            <div className="review-block">
              <h4>Sub-limits</h4>

              <p>
                {
                  analysisResult.analysis.requiresReview
                    .subLimits.message
                }
              </p>

              {analysisResult.analysis.requiresReview
                .subLimits.matchedSubLimits?.length > 0 && (
                <>
                  <strong>
                    Potentially Applicable Sub-limits
                  </strong>

                  <ul>
                    {analysisResult.analysis.requiresReview
                      .subLimits.matchedSubLimits.map(
                        (item, index) => (
                          <li key={index}>
                            {item.category}

                            {item.limitPercentage
                              ? ` — ${item.limitPercentage}%`
                              : ""}

                            {item.description
                              ? ` — ${item.description}`
                              : ""}
                          </li>
                        )
                      )}
                  </ul>
                </>
              )}
            </div>
          )}

          {analysisResult.analysis.requiresReview
            .importantConditions.length > 0 && (
            <div className="review-block">
              <h4>Important Conditions</h4>

              <ul>
                {analysisResult.analysis.requiresReview.importantConditions.map(
                  (item, index) => (
                    <li key={index}>{item}</li>
                  )
                )}
              </ul>
            </div>
          )}
        </div>
      </section>
    )}
  </div>
);
}
export default Claimability;