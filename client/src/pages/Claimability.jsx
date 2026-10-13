import { submissionHeaders } from "../utils/serviceResilience";
import PolicyExtractionReview from "../components/PolicyExtractionReview";
import { formatWaitingDate } from "../utils/waitingPeriodDisplay";
import { validClaimAnalysis } from "../utils/analysisResponseValidation";
import { useEffect, useRef, useState } from "react";
import axios from "axios";
import "./Claimability.css";
import { validateClaimCase } from "../utils/insuranceValidation";

function Claimability() {
  const saving = useRef(false);
  const submission = useRef(null);
  const savedCase = useRef(null);
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
  const [nonPayableExpenses, setNonPayableExpenses] = useState([]);

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

  const addNonPayableExpense = () => {
  setNonPayableExpenses((prev) => [
    ...prev,
    {
      expenseName: "",
      amount: "",
      reason: "",
    },
  ]);
};

const updateNonPayableExpense = (index, field, value) => {
  setNonPayableExpenses((prev) =>
    prev.map((expense, i) =>
      i === index
        ? { ...expense, [field]: value }
        : expense
    )
  );
};

const removeNonPayableExpense = (index) => {
  setNonPayableExpenses((prev) =>
    prev.filter((_, i) => i !== index)
  );
};

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving.current) return;
    const { error: validationError, data: payload } = validateClaimCase({ ...formData, nonPayableExpenses });
    if (validationError) { setError(validationError); return; }
    if (!userPolicies.some(policy => policy._id === payload.userPolicy)) {
      setError("Please select a policy from your account."); return;
    }
    if (payload.patientType === "Family Member" && !familyMembers.some(member => member._id === payload.familyMember)) {
      setError("Please select a family member from your account."); return;
    }
    saving.current = true;
    try {
      setSubmitting(true);
      setError("");
      setSuccess("");
      setAnalysisResult(null);

      // Retry analysis of the saved case rather than creating it again.
      const signature = JSON.stringify(payload);
      let createdCase = savedCase.current?.signature === signature ? savedCase.current.case : null;
      if (!createdCase) {
        const response = await axios.post("/api/claim-cases", payload, {headers:submissionHeaders(submission,payload)});
        createdCase = response.data.claimCase;
        savedCase.current = { signature, case: createdCase };
      }

        const analysisResponse = await axios.get(
        `/api/claim-cases/${createdCase._id}/analyze`
        );

        if (!validClaimAnalysis(analysisResponse.data)) {
        throw new Error("Analysis service returned incomplete results");
      }
      setAnalysisResult(analysisResponse.data);

        setSuccess(
        "Hospitalization case created and analyzed successfully."
        );    
    } catch (err) {

      setError(
        err.response?.data?.message ||
          (savedCase.current ? "Hospitalization case was saved, but analysis failed. Submit again to retry analysis." : "Failed to create hospitalization case.")
      );
    } finally {
      saving.current = false;
      setSubmitting(false);
    }
  };

  if (loadingPolicies) {
    return (
      <div className="claimability-page">
        <p role="status">Loading your policies...</p>
      </div>
    );
  }

  if (userPolicies.length === 0) {
    return (
      <div className="claimability-page">
        <h1>Claimability Analysis</h1>
        {error && <p className="claimability-error" role="alert">{error}</p>}

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
        <p className="claimability-error" role="alert">
          {error}
        </p>
      )}

      {success && (
        <p className="claimability-success" role="status">
          {success}
        </p>
      )}

      <form
        className="claimability-form"
        onSubmit={handleSubmit}
        noValidate
        aria-busy={submitting}
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

        {/* Manual Non-Payable Expenses */}
        <div className="non-payable-section">
          <h3>Manual Non-Payable Expenses</h3>

          <p>
            Enter expenses reported as non-payable, such as
            masks, cotton, or gloves. These amounts must
            already be included in the total hospital bill.
          </p>

          {nonPayableExpenses.map((expense, index) => (
            <div className="non-payable-item" key={index}>
              <div>
                <label htmlFor={`expense-expenseName-${index}`}>Expense Name</label>
                <input
                  id={`expense-expenseName-${index}`}
                  type="text"
                  placeholder="e.g. Masks"
                  value={expense.expenseName}
                  onChange={(e) =>
                    updateNonPayableExpense(
                      index,
                      "expenseName",
                      e.target.value
                    )
                  }
                  required
                />
              </div>

              <div>
                <label htmlFor={`expense-amount-${index}`}>Amount (₹)</label>
                <input
                  id={`expense-amount-${index}`}
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="e.g. 250"
                  value={expense.amount}
                  onChange={(e) =>
                    updateNonPayableExpense(
                      index,
                      "amount",
                      e.target.value
                    )
                  }
                  required
                />
              </div>

              <div>
                <label htmlFor={`expense-reason-${index}`}>Reason (Optional)</label>
                <input
                  id={`expense-reason-${index}`}
                  type="text"
                  placeholder="e.g. Reported as non-payable"
                  value={expense.reason}
                  onChange={(e) =>
                    updateNonPayableExpense(
                      index,
                      "reason",
                      e.target.value
                    )
                  }
                />
              </div>

              <button
                type="button"
                className="remove-expense-btn"
                onClick={() => removeNonPayableExpense(index)}
              >
                Remove
              </button>
            </div>
          ))}

          <button
            type="button"
            className="add-expense-btn"
            onClick={addNonPayableExpense}
          >
            + Add Expense
          </button>

          <div className="non-payable-total">
            <strong>
              Total Reported Non-Payable Expenses: ₹
              {nonPayableExpenses
                .reduce(
                  (sum, expense) =>
                    sum + (Number(expense.amount) || 0),
                  0
                )
                .toLocaleString("en-IN")}
            </strong>
          </div>
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
              {analysisResult.claimabilityScore ?? "Not verified"}
            </span>

            {analysisResult.claimabilityScore !== null && <span className="score-total">/100</span>}

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
                check.passed === null
                  ? "not-verified"
                  : check.passed
                    ? "passed"
                    : "failed"
              }`}
              key={title}
            >
              <div className="check-title">
                <span className="check-icon">
                  {check.passed === null
                    ? "?"
                    : check.passed
                      ? "✓"
                      : "✕"}
                </span>

                <h3>
                  {title}
                  {check.passed === null && " (Not Verified)"}
                </h3>
              </div>

              {check.status && <p><strong>{check.status}</strong></p>}
              <p>{check.message}</p>
              {check.waitingEndDate && <p>Calculated waiting-period boundary: {formatWaitingDate(check.waitingEndDate)}</p>}
            </div>
          ))}
        </div>

        <PolicyExtractionReview key={analysisResult.claimCaseId} review={analysisResult.extractionReview} />
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
            <span>Reported Non-Payable Expenses</span>
            <strong>
              ₹{(
                analysisResult.analysis.financialImpact
                  .totalNonPayableExpenses ?? 0
              ).toLocaleString("en-IN")}
            </strong>
          </div>
            <div>
              <span>Co-payment</span>
              <strong>
                {(analysisResult.analysis.financialImpact.estimatedCoPayment === null ? "Unknown — review required" : "₹" + analysisResult.analysis.financialImpact.estimatedCoPayment.toLocaleString("en-IN"))}
              </strong>
            </div>

            <div>
              <span>Deductible</span>
              <strong>
                {(analysisResult.analysis.financialImpact.estimatedDeductible === null ? "Unknown — review required" : "₹" + analysisResult.analysis.financialImpact.estimatedDeductible.toLocaleString("en-IN"))}
              </strong>
            </div>

            <div>
              <span>Preliminary Amount After Reported Deductions</span>
              <strong>
                {(analysisResult.analysis.financialImpact.estimatedAmountAfterBasicDeductions === null ? "Unknown — review required" : "₹" + analysisResult.analysis.financialImpact.estimatedAmountAfterBasicDeductions.toLocaleString("en-IN"))}
              </strong>
            </div>
          </div>

          {(analysisResult.analysis.financialImpact.nonPayableExpenses ?? [])
            .length > 0 && (
            <div className="expense-breakdown">
              <h4>Itemized Reported Non-Payable Expenses</h4>

              <div className="expense-breakdown-list">
                {analysisResult.analysis.financialImpact.nonPayableExpenses.map(
                  (expense, index) => (
                    <div className="expense-breakdown-row" key={expense._id || index}>
                      <div>
                        <strong>{expense.expenseName}</strong>

                        {expense.reason && (
                          <p>{expense.reason}</p>
                        )}
                      </div>

                      <span>
                        ₹{Number(expense.amount).toLocaleString("en-IN")}
                      </span>
                    </div>
                  )
                )}
              </div>

              <div className="expense-breakdown-total">
                <strong>Total Reported Non-Payable</strong>
                <strong>
                  ₹{analysisResult.analysis.financialImpact.totalNonPayableExpenses.toLocaleString(
                    "en-IN"
                  )}
                </strong>
              </div>
            </div>
          )}  
          
          {analysisResult.analysis.roomRent?.requiresManualReview && (
            <div className="room-rent-financial-warning">
              <strong>Room-Rent Financial Review Required</strong>

              <p>
                {analysisResult.analysis.roomRent.message}
              </p>

              <p>
                The preliminary financial estimate does not
                include any additional room-rent-related
                deductions. The final amount may differ.
              </p>
            </div>
          )}
    
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

              <p><strong>{analysisResult.analysis.requiresReview.pedWaitingPeriod.status}</strong></p>
              <p>Recorded timeline: {analysisResult.analysis.requiresReview.pedWaitingPeriod.timelineStatus}</p>
              {analysisResult.analysis.requiresReview.pedWaitingPeriod.waitingEndDate && (
                <p>Calculated waiting-period boundary: {formatWaitingDate(analysisResult.analysis.requiresReview.pedWaitingPeriod.waitingEndDate)}</p>
              )}
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
                  <strong>Diagnosis mention (unverified):</strong>{" "}
                  {analysisResult.analysis.requiresReview
                    .pedWaitingPeriod
                    .matchedPreExistingDiseases.join(", ")}
                </p>
              )}
            </div>
          )}

          <div className="review-block">
            <h4>Specific Illness Waiting Period</h4>
            <p><strong>{analysisResult.analysis.requiresReview.specificIllnessWaitingPeriod.status}</strong></p>
            <p>Recorded timeline: {analysisResult.analysis.requiresReview.specificIllnessWaitingPeriod.timelineStatus}</p>
            {analysisResult.analysis.requiresReview.specificIllnessWaitingPeriod.waitingEndDate && (
              <p>Calculated waiting-period boundary: {formatWaitingDate(analysisResult.analysis.requiresReview.specificIllnessWaitingPeriod.waitingEndDate)}</p>
            )}
            <p>
              {
                analysisResult.analysis.requiresReview
                  .specificIllnessWaitingPeriod.message
              }
            </p>
          </div>

          {analysisResult.analysis.requiresReview.waitingPolicyWording?.length > 0 && (
            <div className="review-block">
              <h4>Waiting-period wording to verify</h4>
              <ul>{analysisResult.analysis.requiresReview.waitingPolicyWording.map((wording, index) => <li key={index}>{wording}</li>)}</ul>
            </div>
          )}

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