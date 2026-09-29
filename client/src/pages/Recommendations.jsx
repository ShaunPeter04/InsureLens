import { useState } from "react";
import axios from "axios";
import RecommendationCard from "../components/RecommendationCard";
import "./Recommendations.css";

function Recommendations() {
  const [formData, setFormData] = useState({
    requiredCoverage: "",
    coverageType: "Individual",
    budget: "",
    isSmokerOrTobaccoUser: false,
    alcoholConsumption: "Never",
    hasHighRiskOccupation: false,
    coPaymentPreference: 0,
    roomRentPreference: "No Restriction",
  });

  const [preExistingDiseases, setPreExistingDiseases] = useState([]);
  const [otherDisease, setOtherDisease] = useState("");
  const [showOtherDisease, setShowOtherDisease] = useState(false);

  // ==================================================
  // FAMILY FLOATER
  // ==================================================

  const [includeSelf, setIncludeSelf] = useState(false);
  const [familyMembers, setFamilyMembers] = useState([]);
  const [selectedFamilyMembers, setSelectedFamilyMembers] = useState([]);
  const [familyMembersLoading, setFamilyMembersLoading] = useState(false);
  const [familyMembersError, setFamilyMembersError] = useState("");

  const [showFamilyMemberForm, setShowFamilyMemberForm] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState(null);
  const [savingFamilyMember, setSavingFamilyMember] = useState(false);
  const [deletingMemberId, setDeletingMemberId] = useState(null);

  const [familyMemberForm, setFamilyMemberForm] = useState({
    name: "",
    relationship: "",
    dateOfBirth: "",
    gender: "",
    occupation: "",
    isDependent: false,
    preExistingDiseases: [],
  });

  const [newFamilyDisease, setNewFamilyDisease] = useState("");

  // ==================================================
  // RECOMMENDATIONS
  // ==================================================

  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ==================================================
  // OPTIONS
  // ==================================================

  const coverageOptions = [
    { label: "₹5L", value: 500000 },
    { label: "₹10L", value: 1000000 },
    { label: "₹15L", value: 1500000 },
    { label: "₹25L", value: 2500000 },
    { label: "₹50L", value: 5000000 },
  ];

  const commonDiseases = [
    "Diabetes",
    "Hypertension",
    "Thyroid",
    "Asthma",
    "Heart Condition",
  ];

  const coPaymentOptions = [
    {
      label: "0% (No Co-pay)",
      value: 0,
    },
    {
      label: "10%",
      value: 10,
    },
    {
      label: "20%",
      value: 20,
    },
  ];

  const relationshipOptions = [
    "Father",
    "Mother",
    "Spouse",
    "Son",
    "Daughter",
    "Brother",
    "Sister",
    "Grandfather",
    "Grandmother",
    "Other",
  ];

  // ==================================================
  // HELPERS
  // ==================================================

  const calculateAge = (dateOfBirth) => {
    if (!dateOfBirth) {
      return null;
    }

    const birthDate = new Date(dateOfBirth);

    if (Number.isNaN(birthDate.getTime())) {
      return null;
    }

    const today = new Date();

    if (birthDate > today) {
      return null;
    }

    let age = today.getFullYear() - birthDate.getFullYear();

    const monthDifference = today.getMonth() - birthDate.getMonth();

    if (
      monthDifference < 0 ||
      (monthDifference === 0 &&
        today.getDate() < birthDate.getDate())
    ) {
      age--;
    }

    return age;
  };

  const formatDateForInput = (date) => {
    if (!date) {
      return "";
    }

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
      return "";
    }

    const year = parsedDate.getFullYear();
    const month = String(parsedDate.getMonth() + 1).padStart(2, "0");
    const day = String(parsedDate.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  };

  const normalizeDiseaseName = (value) => {
    return value.trim().replace(/\s+/g, " ");
  };

  const selectedPeopleCount =
    (includeSelf ? 1 : 0) + selectedFamilyMembers.length;

  // ==================================================
  // FETCH FAMILY MEMBERS
  // ==================================================

  const fetchFamilyMembers = async () => {
    try {
      setFamilyMembersLoading(true);
      setFamilyMembersError("");

      const response = await axios.get("/api/family-members");

      setFamilyMembers(response.data.familyMembers || []);
    } catch (err) {
      console.error("Failed to fetch family members:", err);

      setFamilyMembers([]);

      setFamilyMembersError(
        err.response?.data?.message || "Failed to load family members."
      );
    } finally {
      setFamilyMembersLoading(false);
    }
  };

  // ==================================================
  // MAIN FORM
  // ==================================================

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));

    if (name === "coverageType") {
      setIncludeSelf(false);
      setSelectedFamilyMembers([]);
      setFamilyMembersError("");
      setShowFamilyMemberForm(false);
      setEditingMemberId(null);

      if (value === "Family Floater") {
        fetchFamilyMembers();
      }
    }
  };

  // ==================================================
  // FAMILY MEMBER SELECTION
  // ==================================================

  const handleFamilyMemberSelection = (memberId) => {
    setSelectedFamilyMembers((prev) => {
      if (prev.includes(memberId)) {
        return prev.filter((id) => id !== memberId);
      }

      return [...prev, memberId];
    });
  };

  // ==================================================
  // FAMILY MEMBER FORM
  // ==================================================

  const handleFamilyMemberFormChange = (e) => {
    const { name, value, type, checked } = e.target;

    setFamilyMemberForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const resetFamilyMemberForm = () => {
    setFamilyMemberForm({
      name: "",
      relationship: "",
      dateOfBirth: "",
      gender: "",
      occupation: "",
      isDependent: false,
      preExistingDiseases: [],
    });

    setNewFamilyDisease("");
    setEditingMemberId(null);
  };

  const handleOpenAddMember = () => {
    resetFamilyMemberForm();
    setFamilyMembersError("");
    setShowFamilyMemberForm(true);
  };

  // ==================================================
  // EDIT FAMILY MEMBER
  // ==================================================

  const handleEditFamilyMember = (member) => {
    setFamilyMembersError("");

    setEditingMemberId(member._id);

    setFamilyMemberForm({
      name: member.name || "",
      relationship: member.relationship || "",
      dateOfBirth: formatDateForInput(member.dateOfBirth),
      gender: member.gender || "",
      occupation: member.occupation || "",
      isDependent: Boolean(member.isDependent),
      preExistingDiseases: member.preExistingDiseases || [],
    });

    setNewFamilyDisease("");
    setShowFamilyMemberForm(true);
  };

  // ==================================================
  // CANCEL FORM
  // ==================================================

  const handleCancelFamilyMemberForm = () => {
    resetFamilyMemberForm();
    setShowFamilyMemberForm(false);
    setFamilyMembersError("");
  };

  // ==================================================
  // FAMILY MEMBER PED
  // ==================================================

  const toggleFamilyDisease = (disease) => {
    setFamilyMemberForm((prev) => {
      const exists = prev.preExistingDiseases.some(
        (item) => item.toLowerCase() === disease.toLowerCase()
      );

      return {
        ...prev,

        preExistingDiseases: exists
          ? prev.preExistingDiseases.filter(
              (item) => item.toLowerCase() !== disease.toLowerCase()
            )
          : [...prev.preExistingDiseases, disease],
      };
    });
  };

  const addCustomFamilyDisease = () => {
    const disease = normalizeDiseaseName(newFamilyDisease);

    if (!disease) {
      return;
    }

    setFamilyMemberForm((prev) => {
      const exists = prev.preExistingDiseases.some(
        (item) => item.toLowerCase() === disease.toLowerCase()
      );

      if (exists) {
        return prev;
      }

      return {
        ...prev,
        preExistingDiseases: [...prev.preExistingDiseases, disease],
      };
    });

    setNewFamilyDisease("");
  };

  const removeFamilyDisease = (disease) => {
    setFamilyMemberForm((prev) => ({
      ...prev,

      preExistingDiseases: prev.preExistingDiseases.filter(
        (item) => item.toLowerCase() !== disease.toLowerCase()
      ),
    }));
  };

  // ==================================================
  // ADD / UPDATE FAMILY MEMBER
  // ==================================================

  const handleSaveFamilyMember = async () => {
    const name = familyMemberForm.name.trim();

    if (
      !name ||
      !familyMemberForm.relationship ||
      !familyMemberForm.dateOfBirth ||
      !familyMemberForm.gender
    ) {
      setFamilyMembersError(
        "Please enter name, relationship, date of birth and gender."
      );

      return;
    }

    const age = calculateAge(familyMemberForm.dateOfBirth);

    if (age === null || age < 0) {
      setFamilyMembersError("Please provide a valid date of birth.");
      return;
    }

    const payload = {
      name,
      relationship: familyMemberForm.relationship,
      dateOfBirth: familyMemberForm.dateOfBirth,
      gender: familyMemberForm.gender,
      occupation: familyMemberForm.occupation.trim(),
      isDependent: familyMemberForm.isDependent,
      preExistingDiseases: familyMemberForm.preExistingDiseases,
    };

    try {
      setSavingFamilyMember(true);
      setFamilyMembersError("");

      // ----------------------------------------------
      // EDIT EXISTING MEMBER
      // ----------------------------------------------

      if (editingMemberId) {
        const response = await axios.put(
          `/api/family-members/${editingMemberId}`,
          payload
        );

        const updatedMember =
          response.data.familyMember ||
          response.data.updatedFamilyMember;

        /*
         * If backend returns the updated member,
         * update immediately.
         *
         * Otherwise fetch again from backend.
         */
        if (updatedMember) {
          setFamilyMembers((prev) =>
            prev.map((member) =>
              member._id === editingMemberId ? updatedMember : member
            )
          );
        } else {
          await fetchFamilyMembers();
        }
      }

      // ----------------------------------------------
      // ADD NEW MEMBER
      // ----------------------------------------------

      else {
        const response = await axios.post(
          "/api/family-members",
          payload
        );

        const addedMember = response.data.familyMember;

        if (addedMember) {
          setFamilyMembers((prev) => [...prev, addedMember]);

          /*
           * A newly added member is automatically
           * selected for this recommendation.
           */
          setSelectedFamilyMembers((prev) => {
            if (prev.includes(addedMember._id)) {
              return prev;
            }

            return [...prev, addedMember._id];
          });
        } else {
          await fetchFamilyMembers();
        }
      }

      resetFamilyMemberForm();
      setShowFamilyMemberForm(false);
    } catch (err) {
      console.error("Save family member error:", err);

      setFamilyMembersError(
        err.response?.data?.message || "Failed to save family member."
      );
    } finally {
      setSavingFamilyMember(false);
    }
  };

  // ==================================================
  // DELETE FAMILY MEMBER
  // ==================================================

  const handleDeleteFamilyMember = async (member) => {
    const confirmed = window.confirm(
      `Delete ${member.name} from your saved family members?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingMemberId(member._id);
      setFamilyMembersError("");

      await axios.delete(`/api/family-members/${member._id}`);

      // Remove from displayed members
      setFamilyMembers((prev) =>
        prev.filter((item) => item._id !== member._id)
      );

      // Remove from selected members
      setSelectedFamilyMembers((prev) =>
        prev.filter((id) => id !== member._id)
      );

      // Close edit form if this member was being edited
      if (editingMemberId === member._id) {
        resetFamilyMemberForm();
        setShowFamilyMemberForm(false);
      }
    } catch (err) {
      console.error("Delete family member error:", err);

      setFamilyMembersError(
        err.response?.data?.message || "Failed to delete family member."
      );
    } finally {
      setDeletingMemberId(null);
    }
  };

  // ==================================================
  // COVERAGE
  // ==================================================

  const handleCoverageSelect = (coverage) => {
    setFormData((prev) => ({
      ...prev,
      requiredCoverage: coverage,
    }));
  };

  // ==================================================
  // SELF PED
  // ==================================================

  const diseaseExists = (disease) => {
    const normalizedDisease =
      normalizeDiseaseName(disease).toLowerCase();

    return preExistingDiseases.some(
      (item) =>
        normalizeDiseaseName(item).toLowerCase() === normalizedDisease
    );
  };

  const toggleDisease = (disease) => {
    const normalizedDisease = normalizeDiseaseName(disease);

    setPreExistingDiseases((prev) => {
      const exists = prev.some(
        (item) =>
          normalizeDiseaseName(item).toLowerCase() ===
          normalizedDisease.toLowerCase()
      );

      if (exists) {
        return prev.filter(
          (item) =>
            normalizeDiseaseName(item).toLowerCase() !==
            normalizedDisease.toLowerCase()
        );
      }

      return [...prev, normalizedDisease];
    });
  };

  const handleAddOtherDisease = () => {
    const disease = normalizeDiseaseName(otherDisease);

    if (!disease) {
      setOtherDisease("");
      setShowOtherDisease(false);
      return;
    }

    if (!diseaseExists(disease)) {
      setPreExistingDiseases((prev) => [...prev, disease]);
    }

    setOtherDisease("");
    setShowOtherDisease(false);
  };

  const handleRemoveDisease = (disease) => {
    const normalizedDisease =
      normalizeDiseaseName(disease).toLowerCase();

    setPreExistingDiseases((prev) =>
      prev.filter(
        (item) =>
          normalizeDiseaseName(item).toLowerCase() !== normalizedDisease
      )
    );
  };

  // ==================================================
  // SUBMIT
  // ==================================================

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError("");

    if (
      !formData.requiredCoverage ||
      Number(formData.requiredCoverage) <= 0
    ) {
      setError("Please select or enter a valid coverage amount.");
      return;
    }

    if (
      formData.coverageType === "Family Floater" &&
      selectedPeopleCount < 2
    ) {
      setError(
        "Please select at least 2 people for a Family Floater policy."
      );

      return;
    }

    try {
      setLoading(true);
      setRecommendations([]);

      const userRequirements = {
        requiredCoverage: Number(formData.requiredCoverage),

        coverageType: formData.coverageType,

        budget:
          formData.budget === ""
            ? null
            : Number(formData.budget),

        preExistingDiseases,

        isSmokerOrTobaccoUser: formData.isSmokerOrTobaccoUser,

        alcoholConsumption:
          formData.alcoholConsumption || null,

        hasHighRiskOccupation: formData.hasHighRiskOccupation,

        coPaymentPreference: Number(
          formData.coPaymentPreference
        ),

        roomRentPreference: formData.roomRentPreference,

        includeSelf:
          formData.coverageType === "Family Floater"
            ? includeSelf
            : true,

        selectedFamilyMembers:
          formData.coverageType === "Family Floater"
            ? selectedFamilyMembers
            : [],
      };

      const response = await axios.post(
        "/api/recommendations",
        userRequirements
      );

      setRecommendations(
        response.data.recommendations || []
      );
    } catch (err) {
      console.error("Recommendation error:", err);

      setError(
        err.response?.data?.message ||
          "Failed to generate recommendations."
      );
    } finally {
      setLoading(false);
    }
  };

  // ==================================================
  // JSX
  // ==================================================

  return (
    <div className="recommendations-page">
      <div className="recommendations-header">
        <h1>Policy Recommendations</h1>

        <p>
          Tell us about your coverage needs, health profile, and
          preferences to find suitable health insurance policies.
        </p>
      </div>

      <div className="recommendation-form-card">
        <form
          className="recommendation-form"
          onSubmit={handleSubmit}
        >
          {/* ==================================================
              SECTION 1
              ================================================== */}

          <div className="recommendation-form-section">
            <div className="form-section-header">
              <span className="section-number">1</span>

              <div>
                <h2>Coverage & Budget</h2>

                <p>
                  Choose who you want to cover and your preferred
                  insurance amount.
                </p>
              </div>
            </div>

            <div className="form-section-grid">
              <div className="recommendation-form-group">
                <label htmlFor="coverageType">
                  Coverage Type
                </label>

                <select
                  id="coverageType"
                  name="coverageType"
                  value={formData.coverageType}
                  onChange={handleChange}
                  required
                >
                  <option value="Individual">
                    Individual
                  </option>

                  <option value="Family Floater">
                    Family Floater
                  </option>
                </select>
              </div>

              <div className="recommendation-form-group">
                <label htmlFor="budget">
                  Annual Insurance Budget (Optional)
                </label>

                <input
                  id="budget"
                  type="number"
                  name="budget"
                  value={formData.budget}
                  onChange={handleChange}
                  min="0"
                  placeholder="e.g. ₹15,000"
                />
              </div>
            </div>

            {/* ==================================================
                FAMILY FLOATER
                ================================================== */}

            {formData.coverageType === "Family Floater" && (
              <div className="family-selection">
                <div className="family-selection-header">
                  <div>
                    <h3>Who should be covered?</h3>

                    <p>
                      Select at least two people to include in this
                      Family Floater.
                    </p>
                  </div>

                  <span className="family-count">
                    {selectedPeopleCount} selected
                  </span>
                </div>

                <div className="family-member-options">
                  {/* SELF */}

                  <label
                    className={
                      includeSelf
                        ? "family-member-option selected"
                        : "family-member-option"
                    }
                  >
                    <input
                      type="checkbox"
                      checked={includeSelf}
                      onChange={(e) =>
                        setIncludeSelf(e.target.checked)
                      }
                    />

                    <div className="family-member-details">
                      <div className="family-member-name-row">
                        <strong>Self</strong>

                        <span className="family-relationship">
                          You
                        </span>
                      </div>

                      <small>
                        Include yourself in this Family Floater
                      </small>
                    </div>
                  </label>

                  {/* LOADING */}

                  {familyMembersLoading && (
                    <p className="family-members-message">
                      Loading saved family members...
                    </p>
                  )}

                  {/* SAVED MEMBERS */}

                  {!familyMembersLoading &&
                    familyMembers.map((member) => {
                      const selected =
                        selectedFamilyMembers.includes(member._id);

                      const age = calculateAge(member.dateOfBirth);

                      return (
                        <div
                          key={member._id}
                          className={
                            selected
                              ? "family-member-option selected"
                              : "family-member-option"
                          }
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() =>
                              handleFamilyMemberSelection(member._id)
                            }
                          />

                          <div className="family-member-details">
                            <div className="family-member-name-row">
                              <strong>{member.name}</strong>

                              <span className="family-relationship">
                                {member.relationship}
                              </span>
                            </div>

                            <div className="family-member-meta">
                              {age !== null && (
                                <span>Age {age}</span>
                              )}

                              {member.gender && (
                                <span>{member.gender}</span>
                              )}

                              {member.isDependent && (
                                <span>Dependent</span>
                              )}
                            </div>

                            {member.preExistingDiseases?.length >
                              0 && (
                              <small className="family-member-ped">
                                PED:{" "}
                                {member.preExistingDiseases.join(
                                  ", "
                                )}
                              </small>
                            )}
                          </div>

                          {/* EDIT / DELETE */}

                          <div className="family-member-card-actions">
                            <button
                              type="button"
                              className="family-member-edit-button"
                              onClick={() =>
                                handleEditFamilyMember(member)
                              }
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              className="family-member-delete-button"
                              onClick={() =>
                                handleDeleteFamilyMember(member)
                              }
                              disabled={
                                deletingMemberId === member._id
                              }
                            >
                              {deletingMemberId === member._id
                                ? "Deleting..."
                                : "Delete"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>

                {/* ERROR */}

                {familyMembersError && (
                  <p className="family-members-error">
                    {familyMembersError}
                  </p>
                )}

                {/* EMPTY */}

                {!familyMembersLoading &&
                  !familyMembersError &&
                  familyMembers.length === 0 &&
                  !showFamilyMemberForm && (
                    <div className="family-empty-state">
                      <strong>
                        No saved family members
                      </strong>

                      <p>
                        Add a family member below to include them
                        in a Family Floater recommendation.
                      </p>
                    </div>
                  )}

                {/* ADD BUTTON */}

                {!showFamilyMemberForm && (
                  <button
                    type="button"
                    className="add-family-member-button"
                    onClick={handleOpenAddMember}
                  >
                    + Add Family Member
                  </button>
                )}

                {/* ==================================================
                    ADD / EDIT FORM
                    ================================================== */}

                {showFamilyMemberForm && (
                  <div className="add-family-member-form">
                    <div className="add-family-member-header">
                      <div>
                        <h4>
                          {editingMemberId
                            ? "Edit Family Member"
                            : "Add Family Member"}
                        </h4>

                        <p>
                          {editingMemberId
                            ? "Update this family member's information."
                            : "Enter the person's details. Age is calculated automatically from date of birth."}
                        </p>
                      </div>
                    </div>

                    <div className="form-section-grid">
                      {/* NAME */}

                      <div className="recommendation-form-group">
                        <label>Name *</label>

                        <input
                          type="text"
                          name="name"
                          value={familyMemberForm.name}
                          onChange={handleFamilyMemberFormChange}
                          placeholder="Full name"
                        />
                      </div>

                      {/* RELATIONSHIP */}

                      <div className="recommendation-form-group">
                        <label>Relationship *</label>

                        <select
                          name="relationship"
                          value={
                            familyMemberForm.relationship
                          }
                          onChange={handleFamilyMemberFormChange}
                        >
                          <option value="">
                            Select relationship
                          </option>

                          {relationshipOptions.map(
                            (relationship) => (
                              <option
                                key={relationship}
                                value={relationship}
                              >
                                {relationship}
                              </option>
                            )
                          )}
                        </select>
                      </div>

                      {/* DOB */}

                      <div className="recommendation-form-group">
                        <label>Date of Birth *</label>

                        <input
                          type="date"
                          name="dateOfBirth"
                          value={familyMemberForm.dateOfBirth}
                          onChange={handleFamilyMemberFormChange}
                          max={
                            new Date()
                              .toISOString()
                              .split("T")[0]
                          }
                        />

                        {familyMemberForm.dateOfBirth &&
                          calculateAge(
                            familyMemberForm.dateOfBirth
                          ) !== null && (
                            <small>
                              Age:{" "}
                              {calculateAge(
                                familyMemberForm.dateOfBirth
                              )}{" "}
                              years
                            </small>
                          )}
                      </div>

                      {/* GENDER */}

                      <div className="recommendation-form-group">
                        <label>Gender *</label>

                        <select
                          name="gender"
                          value={familyMemberForm.gender}
                          onChange={handleFamilyMemberFormChange}
                        >
                          <option value="">
                            Select gender
                          </option>

                          <option value="Male">
                            Male
                          </option>

                          <option value="Female">
                            Female
                          </option>

                          <option value="Other">
                            Other
                          </option>
                        </select>
                      </div>

                      {/* OCCUPATION */}

                      <div className="recommendation-form-group">
                        <label>Occupation</label>

                        <input
                          type="text"
                          name="occupation"
                          value={
                            familyMemberForm.occupation
                          }
                          onChange={handleFamilyMemberFormChange}
                          placeholder="Optional"
                        />
                      </div>
                    </div>

                    {/* DEPENDENT */}

                    <label className="checkbox-option family-dependent-checkbox">
                      <input
                        type="checkbox"
                        name="isDependent"
                        checked={
                          familyMemberForm.isDependent
                        }
                        onChange={handleFamilyMemberFormChange}
                      />

                      <span>
                        Financially dependent
                      </span>
                    </label>

                    {/* PED */}

                    <div className="recommendation-form-group family-ped-section">
                      <label>
                        Pre-existing Diseases
                      </label>

                      <small>
                        Select any known pre-existing conditions
                        for this family member.
                      </small>

                      <div className="disease-options">
                        {commonDiseases.map((disease) => {
                          const active =
                            familyMemberForm.preExistingDiseases.some(
                              (item) =>
                                item.toLowerCase() ===
                                disease.toLowerCase()
                            );

                          return (
                            <button
                              key={disease}
                              type="button"
                              className={
                                active
                                  ? "disease-option active"
                                  : "disease-option"
                              }
                              onClick={() =>
                                toggleFamilyDisease(disease)
                              }
                            >
                              {disease}
                            </button>
                          );
                        })}
                      </div>

                      <div className="disease-input-row">
                        <input
                          type="text"
                          value={newFamilyDisease}
                          onChange={(e) =>
                            setNewFamilyDisease(
                              e.target.value
                            )
                          }
                          placeholder="Other condition"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addCustomFamilyDisease();
                            }
                          }}
                        />

                        <button
                          type="button"
                          className="add-disease-button"
                          onClick={addCustomFamilyDisease}
                        >
                          Add
                        </button>
                      </div>

                      {familyMemberForm.preExistingDiseases
                        .length > 0 && (
                        <div className="disease-tags">
                          {familyMemberForm.preExistingDiseases.map(
                            (disease) => (
                              <span
                                className="disease-tag"
                                key={disease}
                              >
                                {disease}

                                <button
                                  type="button"
                                  onClick={() =>
                                    removeFamilyDisease(
                                      disease
                                    )
                                  }
                                  aria-label={`Remove ${disease}`}
                                >
                                  ×
                                </button>
                              </span>
                            )
                          )}
                        </div>
                      )}
                    </div>

                    {/* FORM ACTIONS */}

                    <div className="family-member-form-actions">
                      <button
                        type="button"
                        className="family-member-cancel-button"
                        onClick={
                          handleCancelFamilyMemberForm
                        }
                        disabled={savingFamilyMember}
                      >
                        Cancel
                      </button>

                      <button
                        type="button"
                        className="family-member-save-button"
                        onClick={handleSaveFamilyMember}
                        disabled={savingFamilyMember}
                      >
                        {savingFamilyMember
                          ? "Saving..."
                          : editingMemberId
                            ? "Save Changes"
                            : "Add Member"}
                      </button>
                    </div>
                  </div>
                )}

                <small className="family-selection-note">
                  Select at least two people. Self is optional.
                  You can add, edit or remove saved family
                  members here.
                </small>
              </div>
            )}

            {/* ==================================================
                REQUIRED COVERAGE
                ================================================== */}

            <div className="recommendation-form-group">
              <label>Required Coverage</label>

              <div className="coverage-options">
                {coverageOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={
                      Number(formData.requiredCoverage) ===
                      option.value
                        ? "coverage-option active"
                        : "coverage-option"
                    }
                    onClick={() =>
                      handleCoverageSelect(option.value)
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="custom-coverage">
                <label htmlFor="requiredCoverage">
                  Or enter a custom amount (₹)
                </label>

                <input
                  id="requiredCoverage"
                  type="number"
                  name="requiredCoverage"
                  value={formData.requiredCoverage}
                  onChange={handleChange}
                  min="1"
                  placeholder="e.g. 700000"
                  required
                />
              </div>
            </div>
          </div>

          {/* ==================================================
              SECTION 2
              ================================================== */}

          <div className="recommendation-form-section">
            <div className="form-section-header">
              <span className="section-number">2</span>

              <div>
                <h2>Health & Lifestyle</h2>

                <p>
                  Provide relevant health and lifestyle
                  information for better policy matching.
                </p>
              </div>
            </div>

            <div className="recommendation-form-group disease-group">
              <label>
                Your Pre-existing Diseases
              </label>

              <small>
                These conditions apply to Self. Family-member
                conditions are taken from their saved profiles.
                If Self is not selected in a Family Floater,
                these conditions are not included in the family
                recommendation.
              </small>

              <div className="disease-options">
                {commonDiseases.map((disease) => (
                  <button
                    key={disease}
                    type="button"
                    className={
                      diseaseExists(disease)
                        ? "disease-option active"
                        : "disease-option"
                    }
                    onClick={() =>
                      toggleDisease(disease)
                    }
                  >
                    {disease}
                  </button>
                ))}

                <button
                  type="button"
                  className={
                    showOtherDisease
                      ? "disease-option active"
                      : "disease-option"
                  }
                  onClick={() =>
                    setShowOtherDisease(
                      (prev) => !prev
                    )
                  }
                >
                  Other
                </button>
              </div>

              {showOtherDisease && (
                <div className="disease-input-row">
                  <input
                    type="text"
                    value={otherDisease}
                    onChange={(e) =>
                      setOtherDisease(e.target.value)
                    }
                    placeholder="Enter another condition"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddOtherDisease();
                      }
                    }}
                  />

                  <button
                    type="button"
                    className="add-disease-button"
                    onClick={handleAddOtherDisease}
                  >
                    Add
                  </button>
                </div>
              )}

              {preExistingDiseases.length > 0 && (
                <div className="disease-tags">
                  {preExistingDiseases.map(
                    (disease) => (
                      <span
                        className="disease-tag"
                        key={disease}
                      >
                        {disease}

                        <button
                          type="button"
                          onClick={() =>
                            handleRemoveDisease(disease)
                          }
                          aria-label={`Remove ${disease}`}
                        >
                          ×
                        </button>
                      </span>
                    )
                  )}
                </div>
              )}
            </div>

            <div className="form-section-grid">
              <div className="recommendation-form-group">
                <label htmlFor="alcoholConsumption">
                  Alcohol Consumption
                </label>

                <select
                  id="alcoholConsumption"
                  name="alcoholConsumption"
                  value={
                    formData.alcoholConsumption
                  }
                  onChange={handleChange}
                >
                  <option value="Never">
                    Never
                  </option>

                  <option value="Occasional">
                    Occasional
                  </option>

                  <option value="Regular">
                    Regular
                  </option>
                </select>
              </div>
            </div>

            <div className="checkbox-options">
              <label className="checkbox-option">
                <input
                  type="checkbox"
                  name="isSmokerOrTobaccoUser"
                  checked={
                    formData.isSmokerOrTobaccoUser
                  }
                  onChange={handleChange}
                />

                <span>
                  Smoker or tobacco user
                </span>
              </label>

              <label className="checkbox-option">
                <input
                  type="checkbox"
                  name="hasHighRiskOccupation"
                  checked={
                    formData.hasHighRiskOccupation
                  }
                  onChange={handleChange}
                />

                <span>
                  High-risk occupation
                </span>
              </label>
            </div>
          </div>

          {/* ==================================================
              SECTION 3
              ================================================== */}

          <div className="recommendation-form-section">
            <div className="form-section-header">
              <span className="section-number">3</span>

              <div>
                <h2>Policy Preferences</h2>

                <p>
                  Choose your preferred cost-sharing and
                  room-rent conditions.
                </p>
              </div>
            </div>

            <div className="recommendation-form-group">
              <label>
                Preferred Co-payment
              </label>

              <div className="copayment-options">
                {coPaymentOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={
                      Number(
                        formData.coPaymentPreference
                      ) === option.value
                        ? "copayment-option active"
                        : "copayment-option"
                    }
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        coPaymentPreference:
                          option.value,
                      }))
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <small>
                A lower co-payment means you pay a smaller
                share of eligible claim expenses yourself.
              </small>
            </div>

            <div className="recommendation-form-group">
              <label htmlFor="roomRentPreference">
                Room Rent Preference
              </label>

              <select
                id="roomRentPreference"
                name="roomRentPreference"
                value={
                  formData.roomRentPreference
                }
                onChange={handleChange}
              >
                <option value="No Restriction">
                  No Restriction
                </option>

                <option value="Flexible">
                  Flexible
                </option>
              </select>
            </div>
          </div>

          {/* ==================================================
              SUBMIT
              ================================================== */}

          <div className="recommendation-submit">
            <button
              type="submit"
              disabled={loading}
            >
              {loading
                ? "Finding Policies..."
                : "Find Recommended Policies"}
            </button>
          </div>

          {loading && (
            <p className="recommendation-status">
              Finding suitable policies for your
              requirements...
            </p>
          )}

          {error && (
            <p className="recommendation-error">
              {error}
            </p>
          )}
        </form>
      </div>

      {/* ==================================================
          RESULTS
          ================================================== */}

      {recommendations.length > 0 && (
        <div className="recommendation-results">
          <h2>Recommended Policies</h2>

          <div className="recommendation-cards">
            {recommendations.map(
              (recommendation, index) => (
                <RecommendationCard
                  key={recommendation.policyId}
                  recommendation={
                    recommendation
                  }
                  rank={index + 1}
                />
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Recommendations;