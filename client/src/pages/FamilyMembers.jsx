import { useEffect, useState } from "react";
import axios from "axios";

function FamilyMembers() {
    const [familyMembers, setFamilyMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [formData, setFormData] = useState({
        name: "",
        relationship: "",
        dateOfBirth: "",
        gender: "",
        occupation: "",
        isDependent: true,
        preExistingDiseases: []
    });

    const [diseaseInput, setDiseaseInput] = useState("");

    const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

        setFormData((prev) => ({
            ...prev,
            [name]: type === "checkbox" ? checked : value
        }));
    };

    const addDisease = () => {
    const disease = diseaseInput.trim();

        if (
            disease &&
            !formData.preExistingDiseases.includes(disease)
        ) {
            setFormData((prev) => ({
                ...prev,
                preExistingDiseases: [
                    ...prev.preExistingDiseases,
                    disease
                ]
            }));
        }

        setDiseaseInput("");
    };

    const removeDisease = (disease) => {
        setFormData((prev) => ({
                ...prev,
                preExistingDiseases:
                    prev.preExistingDiseases.filter(
                    (item) => item !== disease
                )
        }));
    };

    const handleSubmit = async (e) => {
    e.preventDefault();

    try {
        const response = await axios.post(
            "http://localhost:5000/api/family-members",
            formData
        );

        setFamilyMembers((prev) => [
            ...prev,
            response.data.familyMember
        ]);

        setFormData({
            name: "",
            relationship: "",
            dateOfBirth: "",
            gender: "",
            occupation: "",
            isDependent: true,
            preExistingDiseases: []
        });

        setDiseaseInput("");
        setError("");

    } catch (error) {
        console.error("Failed to add family member:", error);

        setError(
            error.response?.data?.message ||
            "Failed to add family member."
        );
    }
};

    useEffect(() => {
        const fetchFamilyMembers = async () => {
            try {
                const response = await axios.get(
                    "http://localhost:5000/api/family-members"
                );

                setFamilyMembers(response.data.familyMembers || []);
            } catch (error) {
                console.error("Failed to fetch family members:", error);

                setError("Failed to load family members.");
            } finally {
                setLoading(false);
            }
        };

        fetchFamilyMembers();
    }, []);

    if (loading) {
        return (
            <div>
                <p>Loading family members...</p>
            </div>
        );
    }

    return (
        <div>
            <h1>Family Members</h1>

            <p>
                Add and manage family members for Family Floater
                recommendations.
            </p>

            <form onSubmit={handleSubmit}>
    <h2>Add Family Member</h2>

    <div>
        <label>Name</label>
        <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
        />
    </div>

    <div>
        <label>Relationship</label>
        <select
            name="relationship"
            value={formData.relationship}
            onChange={handleChange}
            required
        >
            <option value="">Select relationship</option>
            <option value="Spouse">Spouse</option>
            <option value="Son">Son</option>
            <option value="Daughter">Daughter</option>
            <option value="Father">Father</option>
            <option value="Mother">Mother</option>
            <option value="Brother">Brother</option>
            <option value="Sister">Sister</option>
            <option value="Other">Other</option>
        </select>
    </div>

    <div>
        <label>Date of Birth</label>
        <input
            type="date"
            name="dateOfBirth"
            value={formData.dateOfBirth}
            onChange={handleChange}
            max={new Date().toISOString().split("T")[0]}
            required
        />
    </div>

    <div>
        <label>Gender</label>
        <select
            name="gender"
            value={formData.gender}
            onChange={handleChange}
            required
        >
            <option value="">Select gender</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
        </select>
    </div>

    <div>
        <label>Occupation</label>
        <input
            type="text"
            name="occupation"
            value={formData.occupation}
            onChange={handleChange}
            placeholder="Optional"
        />
    </div>

    <div>
        <label>
            <input
                type="checkbox"
                name="isDependent"
                checked={formData.isDependent}
                onChange={handleChange}
            />
            Financially dependent
        </label>
    </div>

    <div>
        <label>Pre-existing Diseases</label>

        <div>
            <input
                type="text"
                value={diseaseInput}
                onChange={(e) => setDiseaseInput(e.target.value)}
                placeholder="e.g. Diabetes"
            />

            <button
                type="button"
                onClick={addDisease}
            >
                Add
            </button>
        </div>

        {formData.preExistingDiseases.map((disease) => (
            <span key={disease}>
                {disease}

                <button
                    type="button"
                    onClick={() => removeDisease(disease)}
                >
                    ×
                    </button>
                </span>
            ))}
        </div>

            <button type="submit">
            Add Family Member
            </button>
            </form>

            {error && <p>{error}</p>}

            {!error && familyMembers.length === 0 && (
                <p>No family members added yet.</p>
            )}

            {familyMembers.map((member) => (
                <div key={member._id}>
                    <h3>{member.name}</h3>

                    <p>Relationship: {member.relationship}</p>

                    <p>
                        Date of Birth:{" "}
                        {new Date(member.dateOfBirth).toLocaleDateString()}
                    </p>

                    <p>Gender: {member.gender}</p>

                    {member.occupation && (
                        <p>Occupation: {member.occupation}</p>
                    )}

                    <p>
                        Dependent: {member.isDependent ? "Yes" : "No"}
                    </p>

                    <p>
                        Pre-existing diseases:{" "}
                        {member.preExistingDiseases?.length > 0
                            ? member.preExistingDiseases.join(", ")
                            : "None"}
                    </p>
                </div>
            ))}
        </div>
    );
}

export default FamilyMembers;