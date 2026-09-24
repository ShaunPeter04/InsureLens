import { useState } from "react";
import { useAuth } from "../context/AuthContext";

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
        error.response?.data?.message || "Failed to update profile"
      );
    }
  };

  if (!user) {
    return <p>Loading profile...</p>;
  }

  return (
    <div>
      <h1>My Profile</h1>

      {!isEditing ? (
        <div>
          <p><strong>First Name:</strong> {user.firstname || "Not provided"}</p>
          <p><strong>Last Name:</strong> {user.lastname || "Not provided"}</p>
          <p><strong>Email:</strong> {user.email || "Not provided"}</p>
          <p><strong>Mobile:</strong> {user.mobile || "Not provided"}</p>

          <p>
            <strong>Date of Birth:</strong>{" "}
            {user.dateOfBirth
              ? user.dateOfBirth.split("T")[0]
              : "Not provided"}
          </p>

          <p><strong>Gender:</strong> {user.gender || "Not provided"}</p>
          <p><strong>Address:</strong> {user.address || "Not provided"}</p>
          <p><strong>City:</strong> {user.city || "Not provided"}</p>
          <p><strong>State:</strong> {user.state || "Not provided"}</p>
          <p><strong>Pincode:</strong> {user.pincode || "Not provided"}</p>
          <p><strong>Occupation:</strong> {user.occupation || "Not provided"}</p>
          <p><strong>Annual Income:</strong> {user.annualIncome ?? "Not provided"}</p>

          <button type="button" onClick={handleEdit}>
            Edit Profile
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div>
            <label>First Name</label>
            <input
              type="text"
              name="firstname"
              value={formData.firstname}
              onChange={handleChange}
            />
          </div>

          <div>
            <label>Last Name</label>
            <input
              type="text"
              name="lastname"
              value={formData.lastname}
              onChange={handleChange}
            />
          </div>

          <div>
            <label>Email</label>
            <p>{user.email}</p>
          </div>

          <div>
            <label>Mobile</label>
            <input
              type="text"
              name="mobile"
              value={formData.mobile}
              onChange={handleChange}
            />
          </div>

          <div>
            <label>Date of Birth</label>
            <input
              type="date"
              name="dateOfBirth"
              value={formData.dateOfBirth}
              onChange={handleChange}
            />
          </div>

          <div>
            <label>Gender</label>
            <select
              name="gender"
              value={formData.gender}
              onChange={handleChange}
            >
              <option value="">Select Gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <label>Address</label>
            <input
              type="text"
              name="address"
              value={formData.address}
              onChange={handleChange}
            />
          </div>

          <div>
            <label>City</label>
            <input
              type="text"
              name="city"
              value={formData.city}
              onChange={handleChange}
            />
          </div>

          <div>
            <label>State</label>
            <input
              type="text"
              name="state"
              value={formData.state}
              onChange={handleChange}
            />
          </div>

          <div>
            <label>Pincode</label>
            <input
              type="text"
              name="pincode"
              value={formData.pincode}
              onChange={handleChange}
            />
          </div>

          <div>
            <label>Occupation</label>
            <input
              type="text"
              name="occupation"
              value={formData.occupation}
              onChange={handleChange}
            />
          </div>

          <div>
            <label>Annual Income</label>
            <input
              type="number"
              name="annualIncome"
              value={formData.annualIncome}
              onChange={handleChange}
            />
          </div>

          {error && <p>{error}</p>}

          <button type="submit">
            Save Changes
          </button>

          <button type="button" onClick={handleCancel}>
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}

export default Profile;