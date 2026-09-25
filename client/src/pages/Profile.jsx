import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import "./Profile.css";

function Profile() {
  const { user, updateProfile } = useAuth();

  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    firstname: user?.firstname || "",
    lastname: user?.lastname || "",
    mobile: user?.mobile || "",
    dateOfBirth: user?.dateOfBirth
      ? user.dateOfBirth.split("T")[0]
      : "",
    gender: user?.gender || "",
    address: user?.address || "",
    city: user?.city || "",
    state: user?.state || "",
    pincode: user?.pincode || "",
    occupation: user?.occupation || "",
    annualIncome: user?.annualIncome || "",
  });

  const handleEdit = () => {
    setFormData({
      firstname: user?.firstname || "",
      lastname: user?.lastname || "",
      mobile: user?.mobile || "",
      dateOfBirth: user?.dateOfBirth
        ? user.dateOfBirth.split("T")[0]
        : "",
      gender: user?.gender || "",
      address: user?.address || "",
      city: user?.city || "",
      state: user?.state || "",
      pincode: user?.pincode || "",
      occupation: user?.occupation || "",
      annualIncome: user?.annualIncome || "",
    });

    setError("");
    setIsEditing(true);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleCancel = () => {
    setError("");
    setIsEditing(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setError("");

      await updateProfile(formData);

      setIsEditing(false);
    } catch (error) {
      setError(
        error.response?.data?.message ||
          "Failed to update profile"
      );
    }
  };

  const formatIncome = (income) => {
    if (income === null || income === undefined || income === "") {
      return "Not provided";
    }

    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(income);
  };

  if (!user) {
    return (
      <div className="profile-page">
        <div className="profile-card">
          Loading profile...
        </div>
      </div>
    );
  }

  return (
    <div className="profile-page">

      {/* Header */}
      <div className="profile-header">
        <h1>
          {isEditing ? "Edit Profile" : "My Profile"}
        </h1>

        <p>
          {isEditing
            ? "Update your personal and financial information."
            : "View and manage your InsureLens profile information."}
        </p>
      </div>

      <div className="profile-card">

        {!isEditing ? (
          <>
            {/* VIEW PROFILE */}

            <h2 className="profile-section-title">
              Personal Information
            </h2>

            <div className="profile-info-grid">

              <ProfileItem
                label="First Name"
                value={user.firstname}
              />

              <ProfileItem
                label="Last Name"
                value={user.lastname}
              />

              <ProfileItem
                label="Email"
                value={user.email}
              />

              <ProfileItem
                label="Mobile"
                value={user.mobile}
              />

              <ProfileItem
                label="Date of Birth"
                value={
                  user.dateOfBirth
                    ? user.dateOfBirth.split("T")[0]
                    : null
                }
              />

              <ProfileItem
                label="Gender"
                value={user.gender}
              />

              <ProfileItem
                label="Address"
                value={user.address}
              />

              <ProfileItem
                label="City"
                value={user.city}
              />

              <ProfileItem
                label="State"
                value={user.state}
              />

              <ProfileItem
                label="Pincode"
                value={user.pincode}
              />

              <ProfileItem
                label="Occupation"
                value={user.occupation}
              />

              <ProfileItem
                label="Annual Income"
                value={formatIncome(user.annualIncome)}
              />

            </div>

            <div className="profile-actions">
              <button
                type="button"
                className="profile-primary-button"
                onClick={handleEdit}
              >
                Edit Profile
              </button>
            </div>
          </>
        ) : (
          <>
            {/* EDIT PROFILE */}

            <h2 className="profile-section-title">
              Update Information
            </h2>

            <form
              className="profile-form"
              onSubmit={handleSubmit}
            >

              <FormField
                label="First Name"
                name="firstname"
                value={formData.firstname}
                onChange={handleChange}
              />

              <FormField
                label="Last Name"
                name="lastname"
                value={formData.lastname}
                onChange={handleChange}
              />

              {/* Email is read-only */}
              <div className="profile-form-group">
                <label>Email</label>

                <p className="profile-email">
                  {user.email}
                </p>
              </div>

              <FormField
                label="Mobile"
                name="mobile"
                value={formData.mobile}
                onChange={handleChange}
              />

              <FormField
                label="Date of Birth"
                name="dateOfBirth"
                type="date"
                value={formData.dateOfBirth}
                onChange={handleChange}
              />

              <div className="profile-form-group">
                <label htmlFor="gender">
                  Gender
                </label>

                <select
                  id="gender"
                  name="gender"
                  value={formData.gender}
                  onChange={handleChange}
                >
                  <option value="">
                    Select Gender
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

              <FormField
                label="Address"
                name="address"
                value={formData.address}
                onChange={handleChange}
              />

              <FormField
                label="City"
                name="city"
                value={formData.city}
                onChange={handleChange}
              />

              <FormField
                label="State"
                name="state"
                value={formData.state}
                onChange={handleChange}
              />

              <FormField
                label="Pincode"
                name="pincode"
                value={formData.pincode}
                onChange={handleChange}
              />

              <FormField
                label="Occupation"
                name="occupation"
                value={formData.occupation}
                onChange={handleChange}
              />

              <FormField
                label="Annual Income"
                name="annualIncome"
                type="number"
                value={formData.annualIncome}
                onChange={handleChange}
              />

              {error && (
                <p className="profile-error">
                  {error}
                </p>
              )}

              <div className="profile-form-actions">

                <button
                  type="submit"
                  className="profile-primary-button"
                >
                  Save Changes
                </button>

                <button
                  type="button"
                  className="profile-secondary-button"
                  onClick={handleCancel}
                >
                  Cancel
                </button>

              </div>

            </form>
          </>
        )}

      </div>
    </div>
  );
}


/* Displays one profile field */

function ProfileItem({ label, value }) {
  return (
    <div className="profile-info-item">

      <span className="profile-info-label">
        {label}
      </span>

      <span className="profile-info-value">
        {value || "Not provided"}
      </span>

    </div>
  );
}


/* Reusable edit field */

function FormField({
  label,
  name,
  value,
  onChange,
  type = "text",
}) {
  return (
    <div className="profile-form-group">

      <label htmlFor={name}>
        {label}
      </label>

      <input
        id={name}
        type={type}
        name={name}
        value={value}
        onChange={onChange}
      />

    </div>
  );
}

export default Profile;