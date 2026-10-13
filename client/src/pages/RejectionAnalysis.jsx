import { submissionHeaders } from "../utils/serviceResilience";
import PolicyExtractionReview from "../components/PolicyExtractionReview";
import { formatWaitingDate } from "../utils/waitingPeriodDisplay";
import { validRejectionAnalysis } from "../utils/analysisResponseValidation";


import { useEffect, useRef, useState } from "react";

import axios from "axios";

import "./RejectionAnalysis.css";
import { validateRejectionCase } from "../utils/insuranceValidation";



function RejectionAnalysis() {
  const saving = useRef(false);
  const submission = useRef(null);
  const savedCase = useRef(null);

  const [userPolicies, setUserPolicies] = useState([]);

  const [claimCases, setClaimCases] = useState([]);

  const [loading, setLoading] = useState(true);

  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState("");

  const [success, setSuccess] = useState("");

  const [analysisResult, setAnalysisResult] = useState(null);



  const [formData, setFormData] = useState({

    userPolicy: "",

    claimCase: "",

    rejectionReason: "",

    insurerRemarks: "",

    rejectedAmount: "",

    rejectionDate: "",

  });



  useEffect(() => {

    const fetchData = async () => {

      try {

        const [policiesResponse, claimsResponse] =

          await Promise.all([

            axios.get("/api/user-policies"),

            axios.get("/api/claim-cases"),

          ]);



        const policies =

          policiesResponse.data.userPolicies || [];



        setUserPolicies(policies);

        setClaimCases(

          claimsResponse.data.claimCases || []

        );



        if (policies.length > 0) {

          setFormData((prev) => ({

            ...prev,

            userPolicy: policies[0]._id,

          }));

        }

      } catch (err) {

        setError(

          err.response?.data?.message ||

          "Failed to load policy information."

        );

      } finally {

        setLoading(false);

      }

    };



    fetchData();

  }, []);



  const handleChange = (e) => {

    const { name, value } = e.target;



    setFormData((prev) => ({

      ...prev,

      [name]: value,

      ...(name === "userPolicy"

        ? { claimCase: "" }

        : {}),

    }));

  };



  const filteredClaimCases = claimCases.filter(

    (claim) => {

      const policyId =

        typeof claim.userPolicy === "object"

          ? claim.userPolicy?._id

          : claim.userPolicy;



      return policyId === formData.userPolicy;

    }

  );



const handleSubmit = async (e) => {
  e.preventDefault();
  if (saving.current) return;
  const { error: validationError, data: payload } = validateRejectionCase(formData);
  if (validationError) { setError(validationError); return; }
  if (!userPolicies.some(policy => policy._id === payload.userPolicy)) {
    setError("Please select a policy from your account."); return;
  }
  if (payload.claimCase && !filteredClaimCases.some(claim => claim._id === payload.claimCase)) {
    setError("Select a hospitalization case linked to this policy."); return;
  }

  setError("");
  setSuccess("");
  setAnalysisResult(null);

  const reason = `${formData.rejectionReason || ""} ${formData.insurerRemarks || ""}`
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const requiresHospitalization =
    reason.includes("initial waiting") ||
    reason.includes("waiting period") ||
    reason.includes("first 30 days") ||
    reason.includes("30 day waiting") ||
    reason.includes("policy too new");

  if (requiresHospitalization && !formData.claimCase) {
    setError(
      "Please select a hospitalization case to verify the waiting period."
    );
    return;
  }

  saving.current = true;
  setSubmitting(true);
    setError("");

    setSuccess("");

    setAnalysisResult(null);



    try {

      const signature = JSON.stringify(payload);
      let createdCase = savedCase.current?.signature === signature ? savedCase.current.case : null;
      if (!createdCase) {
        const response = await axios.post("/api/rejection-cases", {
          ...payload, rejectionDate: payload.rejectionDate || undefined
        }, {headers:submissionHeaders(submission,payload)});
        createdCase = response.data.rejectionCase;
        savedCase.current = { signature, case: createdCase };
      }

      const analysisResponse = await axios.get(

        `/api/rejection-cases/${createdCase._id}/analyze`

      );



      if (!validRejectionAnalysis(analysisResponse.data)) {
        throw new Error("Analysis service returned incomplete results");
      }
      setAnalysisResult(analysisResponse.data);

      setSuccess(

        analysisResponse.data.mlPrediction?.available === false ? "Rule-based analysis completed. ML predictions are unavailable; submit again to retry prediction." : "Rejection case created and analyzed successfully."

      );

    } catch (err) {

      setError(

        err.response?.data?.message ||

        (savedCase.current ? "Rejection case was saved, but analysis failed. Submit again to retry analysis." : "Failed to analyze the rejection case.")

      );

    } finally {

      saving.current = false;
      setSubmitting(false);

    }

  };



  if (loading) {

    return (

      <div className="rejection-page">

        <p role="status">Loading your policy information...</p>

      </div>

    );

  }



  return (

    <div className="rejection-page">

      <h1>Rejection Analysis & Recovery</h1>



      <p>

        Enter your claim rejection details to identify

        possible reasons and recovery steps.

      </p>



      {error && (

        <p className="rejection-error" role="alert">{error}</p>

      )}



      {success && (

        <p className="rejection-success" role="status">{success}</p>

      )}



      {userPolicies.length === 0 ? (

        <p>

          Add a policy under My Policies before

          analyzing a rejected claim.

        </p>

      ) : (

        <form

          className="rejection-form"

          onSubmit={handleSubmit}
          noValidate
          aria-busy={submitting}

        >

          <div>

            <label htmlFor="userPolicy">

              Insurance Policy

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



                return (

                  <option

                    key={item._id}

                    value={item._id}

                  >

                    {policy?.policyName ||

                      "Unnamed Policy"}

                    {item.policyNumber

                      ? ` (${item.policyNumber})`

                      : ""}

                  </option>

                );

              })}

            </select>

          </div>



          <div>

            <label htmlFor="claimCase">

              Hospitalization Case (Optional)

            </label>

            <select

              id="claimCase"

              name="claimCase"

              value={formData.claimCase}

              onChange={handleChange}

            >

              <option value="">

                No linked hospitalization case

              </option>

              {filteredClaimCases.map((claim) => (

                <option

                  key={claim._id}

                  value={claim._id}

                >

                  {claim.diagnosis} —{" "}

                  {claim.hospitalName}

                </option>

              ))}

            </select>

          </div>



          <div>

            <label htmlFor="rejectionReason">

              Rejection Reason

            </label>

            <textarea

              id="rejectionReason"

              name="rejectionReason"

              value={formData.rejectionReason}

              onChange={handleChange}

              placeholder="Enter the reason provided by the insurer"

              required

              rows={3}

            />

          </div>



          <div>

            <label htmlFor="insurerRemarks">

              Insurer Remarks

            </label>

            <textarea

              id="insurerRemarks"

              name="insurerRemarks"

              value={formData.insurerRemarks}

              onChange={handleChange}

              placeholder="Additional details from the rejection letter"

              rows={3}

            />

          </div>



          <div>

            <label htmlFor="rejectedAmount">

              Rejected Amount (₹)

            </label>

            <input

              id="rejectedAmount"

              name="rejectedAmount"

              type="number"

              min="0"

              value={formData.rejectedAmount}

              onChange={handleChange}

            />

          </div>



          <div>

            <label htmlFor="rejectionDate">

              Rejection Date

            </label>

            <input

              id="rejectionDate"

              name="rejectionDate"

              type="date"

              value={formData.rejectionDate}

              onChange={handleChange}

            />

          </div>



          <button type="submit" disabled={submitting}>

            {submitting

              ? "Analyzing..."

              : "Analyze Rejection"}

          </button>

        </form>

      )}



      {analysisResult && (

        <section className="rejection-result">
          <PolicyExtractionReview key={analysisResult.rejectionCaseId} review={analysisResult.analysis.extractionReview} />

            <div className="rejection-result-header">

            <div>

                <h2>Rejection Analysis Result</h2>

                <p>{analysisResult.policyName}</p>

            </div>



            <span className="rejection-amount">

                ₹{Number(analysisResult.rejectedAmount || 0).toLocaleString("en-IN")}

            </span>

            </div>



            <div className="rejection-summary-grid">

            <div className="rejection-summary-card">

                <span>Recovery Assessment</span>

                <strong>

                {analysisResult.analysis.recoveryAssessment ||

                    "Further Evidence Required"}

                </strong>

            </div>



            <div className="rejection-summary-card">

                <span>Evidence Status</span>

                <strong>

                {analysisResult.analysis.evidenceStatus ||

                    "Not Independently Verified"}

                </strong>

            </div>



            <div className="rejection-summary-card">

                <span>Classification</span>

                <strong>

                {analysisResult.analysis.classificationConfidence ||

                    "Not Available"}

                </strong>

            </div>

            </div>



            {analysisResult.mlPrediction && (
              <div className="rejection-section">
                <h3>ML-Based Rejection Classification</h3>

                {analysisResult.mlPrediction.available ? (
                  <>
                    <div className="rejection-summary-grid">
                      <div className="rejection-summary-card">
                        <span>Logistic Regression Prediction</span>
                        <strong>{analysisResult.mlPrediction.primaryPrediction || "Not available"}</strong>
                      </div>
                      <div className="rejection-summary-card">
                        <span>Decision Tree Prediction</span>
                        <strong>{analysisResult.mlPrediction.decisionTreePrediction || "Not available"}</strong>
                      </div>
                      <div className="rejection-summary-card">
                        <span>Model Agreement</span>
                        <strong>{analysisResult.mlPrediction.modelAgreement ? "Yes" : "No"}</strong>
                      </div>
                      <div className="rejection-summary-card">
                        <span>Highest Class Score (uncalibrated)</span>
                        <strong>
                          {typeof analysisResult.mlPrediction.highestClassScore === "number"
                            ? analysisResult.mlPrediction.highestClassScore.toFixed(4)
                            : "Not available"}
                        </strong>
                      </div>
                    </div>

                    {analysisResult.mlPrediction.requiresManualReview && (
                      <p className="rejection-disclaimer">
                        Manual review required. The ML predictions are not sufficient to determine
                        whether the rejection is valid or whether an appeal will succeed.
                      </p>
                    )}

                    {Array.isArray(analysisResult.mlPrediction.reviewReasons) &&
                      analysisResult.mlPrediction.reviewReasons.length > 0 && (
                        <div className="rejection-verification">
                          <strong>Manual Review Reasons</strong>
                          <ul>
                            {analysisResult.mlPrediction.reviewReasons.map((reason, index) => (
                              <li key={index}>{reason}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                    {analysisResult.mlPrediction.evaluationNote && (
                      <p className="rejection-section-description">
                        {analysisResult.mlPrediction.evaluationNote}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="rejection-section-description">
                    ML classification is currently unavailable. The rule-based analysis remains available.
                  </p>
                )}
              </div>
            )}

            <div className="rejection-section">

            <h3>Identified Rejection Categories</h3>



            <div className="rejection-category-list">

                {analysisResult.analysis.categories.map((category, index) => (

                <span className="rejection-category" key={index}>

                    {category}

                </span>

                ))}

            </div>

            </div>



            {analysisResult.analysis.waitingPeriodVerification?.applicable && (

            <div className="rejection-section">

                <h3>Waiting Period Verification</h3>



                <div className="rejection-verification">

                <strong>

                    {analysisResult.analysis.waitingPeriodVerification.status}

                </strong>



                <p>

                    {analysisResult.analysis.waitingPeriodVerification.message}

                </p>

                </div>

            </div>

            )}



            <div className="rejection-section">

            <h3>Why This Claim May Have Been Rejected</h3>



            <ul>

                {analysisResult.analysis.explanations.map((item, index) => (

                <li key={index}>{item}</li>

                ))}

            </ul>

            </div>



            {analysisResult.analysis.detailedWaitingPeriodAnalysis &&

  (analysisResult.analysis.waitingPeriodVerification?.applicable || analysisResult.analysis.categories.some((category) =>

    ["Waiting Period", "Pre-existing Disease"].includes(category)

  )) && (

    <div className="rejection-section">

      <h3>Detailed Waiting Period Assessment</h3>



      <p className="rejection-section-description">

        These checks use the recorded policy and hospitalization

        information. They do not independently verify the insurer's

        interpretation of the policy.

      </p>



      {analysisResult.analysis.detailedWaitingPeriodAnalysis.policyWordingToReview?.length > 0 && (
        <ul>{analysisResult.analysis.detailedWaitingPeriodAnalysis.policyWordingToReview.map((wording, index) => <li key={index}>{wording}</li>)}</ul>
      )}

      <div className="rejection-waiting-grid">

        {[

          {

            title: "Initial Waiting Period",

            data: analysisResult.analysis

              .detailedWaitingPeriodAnalysis.initial,

          },

          {

            title: "Specific Illness Waiting Period",

            data: analysisResult.analysis

              .detailedWaitingPeriodAnalysis.specificIllness,

          },

          {

            title: "Pre-existing Disease Waiting Period",

            data: analysisResult.analysis

              .detailedWaitingPeriodAnalysis.preExistingDisease,

          },

        ].map(({ title, data }) => (

          <div className="rejection-waiting-card" key={title}>

            <h4>{title}</h4>



            <strong>{data?.status || "Not Available"}</strong>
            {data?.timelineStatus && <p>Recorded timeline: {data.timelineStatus}</p>}



            <p>{data?.message}</p>



            {data?.waitingEndDate && (

              <p className="rejection-waiting-date">

                <strong>Calculated waiting-period boundary:</strong>{" "}

                {formatWaitingDate(data.waitingEndDate)}

              </p>

            )}



            {data?.matchedConditions?.length > 0 && (

              <p>

                <strong>Matched conditions:</strong>{" "}

                {data.matchedConditions.join(", ")}

              </p>

            )}

          </div>

        ))}

      </div>

    </div>

  )}



            <div className="rejection-section">

            <h3>Relevant Policy Information</h3>



            {analysisResult.analysis.policyClausesToReview?.length > 0 ? (

                <div className="rejection-policy-clauses">

                {analysisResult.analysis.policyClausesToReview.map(
                    (clause, index) => (

                    <div className="rejection-clause" key={index}>

                        <strong>

                        {clause.field

                            .replace(/([A-Z])/g, " $1")

                            .replace(/^./, (letter) => letter.toUpperCase())}

                        </strong>

                        {clause.field === "waitingPeriods" &&
                        clause.value &&
                        typeof clause.value === "object" &&
                        !Array.isArray(clause.value) ? (
                        <div className="waiting-period-details">
                            <p>
                            <strong>Initial Waiting Period:</strong>{" "}
                            {clause.value.initialDays ?? "Not specified"} days
                            </p>

                            <p>
                            <strong>Specific Illness Waiting Period:</strong>{" "}
                            {clause.value.specificIllnessesMonths ?? "Not specified"} months
                            </p>

                            <p>
                            <strong>Pre-existing Disease Waiting Period:</strong>{" "}
                            {clause.value.preExistingDiseasesMonths ?? "Not specified"} months
                            </p>

                            {Array.isArray(clause.value.specificIllnessConditions) &&
                            clause.value.specificIllnessConditions.length > 0 && (
                                <div>
                                <strong>Specific Illness Conditions:</strong>
                                <ul>
                                    {clause.value.specificIllnessConditions.map(
                                    (condition, index) => (
                                        <li key={index}>{condition}</li>
                                    )
                                    )}
                                </ul>
                                </div>
                            )}
                        </div>
                        ) : (
                        <pre>
                            {clause.value == null
                            ? "Not available in stored policy data"
                            : typeof clause.value === "object"
                            ? JSON.stringify(clause.value, null, 2)
                            : String(clause.value)}
                        </pre>
                        )}

                    </div>

                    )

                )}

                </div>

            ) : (

                <p>

                No specific policy fields were identified automatically.

                Review the complete policy wording.

                </p>

            )}

            </div>



            <div className="rejection-section">

            <h3>Recommended Recovery Actions</h3>



            <ol className="rejection-actions">

                {analysisResult.analysis.recoveryActions.map((action, index) => (

                <li key={index}>{action}</li>

                ))}

            </ol>

            </div>



            <p className="rejection-disclaimer">

            {analysisResult.analysis.disclaimer}

            </p>

        </section>

        )}

    </div>

  );

}



export default RejectionAnalysis;