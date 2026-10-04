import { useEffect, useState } from "react";
import axios from "axios";
import "./MyPolicies.css";

function MyPolicies() {
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
      console.error(
        "Failed to load user policies:",
        err
      );

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
      console.error(
        "Failed to load user policies:",
        err
      );

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

    if (
      !uploadForm.selectedCoverage ||
      Number(uploadForm.selectedCoverage) <= 0
    ) {
      setError(
        "Please enter a valid coverage amount."
      );
      return;
    }

    if (
      !uploadForm.policyStartDate ||
      !uploadForm.policyEndDate
    ) {
      setError(
        "Please enter the policy start and end dates."
      );
      return;
    }

    if (
      new Date(uploadForm.policyEndDate) <=
      new Date(uploadForm.policyStartDate)
    ) {
      setError(
        "Policy end date must be after the start date."
      );
      return;
    }

    try {
      setUploading(true);

      const formData = new FormData();

      formData.append(
        "policyDocument",
        uploadForm.policyDocument
      );

      formData.append(
        "selectedCoverage",
        uploadForm.selectedCoverage
      );

      formData.append(
        "policyNumber",
        uploadForm.policyNumber
      );

      formData.append(
        "policyStartDate",
        uploadForm.policyStartDate
      );

      formData.append(
        "policyEndDate",
        uploadForm.policyEndDate
      );

      await axios.post(
        "/api/user-policies/upload",
        formData
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
      console.error(
        "Failed to upload policy:",
        err
      );

      setError(
        err.response?.data?.message ||
          err.response?.data?.detail ||
          "Failed to upload policy."
      );
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="my-policies-page">
        <p>Loading your policies...</p>
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
        >
          <h2>Upload Your Policy</h2>

          <p className="upload-description">
            Upload your health insurance policy
            PDF. InsureLens will extract the
            policy information for claimability
            analysis.
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
              Scanned PDFs may take longer
              because OCR is used.
            </p>
          )}
        </form>
      )}

      {error && (
        <div className="my-policies-error">
          {error}
        </div>
      )}

      {uploadSuccess && (
        <div className="my-policies-success">
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