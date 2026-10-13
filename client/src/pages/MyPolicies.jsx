import { submissionHeaders } from "../utils/serviceResilience";
import PolicyExtractionReview from "../components/PolicyExtractionReview";
import { useEffect, useRef, useState } from "react";
import axios from "axios";
import "./MyPolicies.css";
import { validateSavedPolicy } from "../utils/insuranceValidation";

function MyPolicies() {
  const saving = useRef(false);
  const submission = useRef(null);
  const [userPolicies, setUserPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showUploadForm, setShowUploadForm] =
    useState(false);

  const [uploading, setUploading] =
    useState(false);

  const [uploadSuccess, setUploadSuccess] =
    useState("");

  const [uploadForm, setUploadForm] = useState({
    policyNumber: "",
    selectedCoverage: "",
    policyStartDate: "",
    policyEndDate: "",
    policyDocument: null,
  });

  const fetchUserPolicies = async () => {
    try {
      setError("");

      const response = await axios.get(
        "/api/user-policies"
      );

      setUserPolicies(
        response.data.userPolicies || []
      );
    } catch (err) {

      setError(
        err.response?.data?.message ||
          "Failed to load your policies."
      );
    } finally {
      setLoading(false);
    }
  };

useEffect(() => {
  const loadPolicies = async () => {
    try {
      setError("");

      const response = await axios.get(
        "/api/user-policies"
      );

      setUserPolicies(
        response.data.userPolicies || []
      );
    } catch (err) {

      setError(
        err.response?.data?.message ||
          "Failed to load your policies."
      );
    } finally {
      setLoading(false);
    }
  };

  loadPolicies();
}, []);

  const handleInputChange = (event) => {
    const { name, value } = event.target;

    setUploadForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];

    setUploadForm((previous) => ({
      ...previous,
      policyDocument: file || null,
    }));
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    if (saving.current) return;

    setError("");
    setUploadSuccess("");

    if (!uploadForm.policyDocument) {
      setError("Please select a policy PDF.");
      return;
    }

    if (
      uploadForm.policyDocument.type !==
      "application/pdf"
    ) {
      setError(
        "Only PDF policy documents are allowed."
      );
      return;
    }

    if (uploadForm.policyDocument.size <= 0 || uploadForm.policyDocument.size > 10 * 1024 * 1024) {
      setError("Policy PDF must be nonempty and no larger than 10 MB.");
      return;
    }
    const { error: validationError, data } = validateSavedPolicy(uploadForm, { uploaded: true });
    if (validationError) {
      setError(validationError);
      return;
    }
    if (data.policyNumber && userPolicies.some(policy => policy.policyNumber === data.policyNumber)) {
      setError("This policy number is already saved in your account.");
      return;
    }
    saving.current = true;

    try {
      setUploading(true);

      const formData = new FormData();

      formData.append(
        "policyDocument",
        uploadForm.policyDocument
      );

      formData.append(
        "selectedCoverage",
        data.selectedCoverage
      );

      formData.append(
        "policyNumber",
        data.policyNumber
      );

      formData.append(
        "policyStartDate",
        data.policyStartDate
      );

      formData.append(
        "policyEndDate",
        data.policyEndDate
      );

      await axios.post(
        "/api/user-policies/upload",
        formData,
        {timeout:40000, headers:submissionHeaders(submission,{...data, file:uploadForm.policyDocument.name, size:uploadForm.policyDocument.size, modified:uploadForm.policyDocument.lastModified})}
      );

      setUploadSuccess(
        "Policy uploaded and processed successfully."
      );

      setUploadForm({
        policyNumber: "",
        selectedCoverage: "",
        policyStartDate: "",
        policyEndDate: "",
        policyDocument: null,
      });

      setShowUploadForm(false);

      await fetchUserPolicies();
    } catch (err) {

      setError(
        err.response?.data?.message ||
          err.response?.data?.detail ||
          "Failed to upload policy."
      );
    } finally {
      saving.current = false;
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="my-policies-page">
        <p role="status">Loading your policies...</p>
      </div>
    );
  }

  return (
    <div className="my-policies-page">
      <div className="my-policies-header">
        <div>
          <h1>My Policies</h1>

          <p>
            Health insurance policies saved to
            your account.
          </p>
        </div>

        <button
          type="button"
          className="upload-policy-button"
          disabled={uploading}
          onClick={() => {
            setShowUploadForm(
              (previous) => !previous
            );

            setError("");
            setUploadSuccess("");
          }}
        >
          {showUploadForm
            ? "Cancel"
            : "Upload Policy PDF"}
        </button>
      </div>

      {showUploadForm && (
        <form
          className="policy-upload-form"
          onSubmit={handleUpload}
          noValidate
          aria-busy={uploading}
        >
          <h2>Upload Your Policy</h2>

          <p className="upload-description">
            Upload your health insurance policy
            PDF. InsureLens will extract the
            policy information for manual review. Extracted terms do not verify coverage. Use an unencrypted text PDF (maximum 10 MB and 50 pages).
          </p>

          <div className="upload-form-grid">
            <div className="upload-field">
              <label htmlFor="policyNumber">
                Policy Number
              </label>

              <input
                id="policyNumber"
                type="text"
                name="policyNumber"
                value={uploadForm.policyNumber}
                onChange={handleInputChange}
                placeholder="Enter policy number"
              />
            </div>

            <div className="upload-field">
              <label htmlFor="selectedCoverage">
                Sum Insured / Coverage
              </label>

              <input
                id="selectedCoverage"
                type="number"
                name="selectedCoverage"
                min="1"
                value={
                  uploadForm.selectedCoverage
                }
                onChange={handleInputChange}
                placeholder="e.g. 500000"
                required
              />
            </div>

            <div className="upload-field">
              <label htmlFor="policyStartDate">
                Policy Start Date
              </label>

              <input
                id="policyStartDate"
                type="date"
                name="policyStartDate"
                value={
                  uploadForm.policyStartDate
                }
                onChange={handleInputChange}
                required
              />
            </div>

            <div className="upload-field">
              <label htmlFor="policyEndDate">
                Policy End Date
              </label>

              <input
                id="policyEndDate"
                type="date"
                name="policyEndDate"
                value={uploadForm.policyEndDate}
                onChange={handleInputChange}
                required
              />
            </div>
          </div>

          <div className="upload-field">
            <label htmlFor="policyDocument">
              Policy PDF
            </label>

            <input
              id="policyDocument"
              type="file"
              accept="application/pdf,.pdf"
              onChange={handleFileChange}
              required
            />

            {uploadForm.policyDocument && (
              <p className="selected-file">
                Selected:{" "}
                {
                  uploadForm.policyDocument
                    .name
                }
              </p>
            )}
          </div>

          <button
            type="submit"
            className="process-policy-button"
            disabled={uploading}
          >
            {uploading
              ? "Processing Policy..."
              : "Upload & Process Policy"}
          </button>

          {uploading && (
            <p className="processing-message">
              Extracting policy information.
              Use a text-based PDF. Scanned or mixed-image PDFs are not supported in this demonstration.
            </p>
          )}
        </form>
      )}

      {error && (
        <div className="my-policies-error" role="alert">
          {error}
        </div>
      )}

      {uploadSuccess && (
        <div className="my-policies-success" role="status">
          {uploadSuccess}
        </div>
      )}

      {!error &&
        userPolicies.length === 0 && (
          <p>
            You haven't added any policies yet.
          </p>
        )}

      <div className="my-policies-list">
        {userPolicies.map((userPolicy) => {
          const isUploaded =
            userPolicy.sourceType === "Uploaded";

          const policy = isUploaded
            ? userPolicy.extractedPolicyData
            : userPolicy.policy;

          return (
            <div
              className="my-policy-card"
              key={userPolicy._id}
            >
              <div className="policy-card-heading">
                <div>
                  <h2>
                    {policy?.policyName ||
                      "Uploaded Health Policy"}
                  </h2>

                  <p>
                    {policy?.insuranceCompany ||
                      "Insurance company not detected"}
                  </p>
                </div>

                <span
                  className={
                    isUploaded
                      ? "policy-source uploaded"
                      : "policy-source catalog"
                  }
                >
                  {isUploaded
                    ? "Uploaded"
                    : "Catalog"}
                </span>
              </div>

              <p>
                <strong>Coverage:</strong>{" "}
                ₹
                {Number(
                  userPolicy.selectedCoverage
                ).toLocaleString("en-IN")}
              </p>

              <p>
                <strong>
                  Policy Number:
                </strong>{" "}
                {userPolicy.policyNumber ||
                  "Not provided"}
              </p>

              <p>
                <strong>Status:</strong>{" "}
                {userPolicy.status}
              </p>

              <p>
                <strong>
                  Policy Start:
                </strong>{" "}
                {new Date(
                  userPolicy.policyStartDate
                ).toLocaleDateString("en-IN")}
              </p>

              <p>
                <strong>Policy End:</strong>{" "}
                {new Date(
                  userPolicy.policyEndDate
                ).toLocaleDateString("en-IN")}
              </p>

              {isUploaded && <PolicyExtractionReview review={userPolicy.extractionReview} />}

              {isUploaded &&
                userPolicy.uploadedDocument
                  ?.originalName && (
                  <p>
                    <strong>
                      Document:
                    </strong>{" "}
                    {
                      userPolicy
                        .uploadedDocument
                        .originalName
                    }
                  </p>
                )}

              {isUploaded &&
                userPolicy.uploadedDocument
                  ?.extractionMethod && (
                  <p>
                    <strong>
                      Extraction:
                    </strong>{" "}
                    {
                      userPolicy
                        .uploadedDocument
                        .extractionMethod
                    }
                  </p>
                )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default MyPolicies;