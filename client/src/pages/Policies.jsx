import { useEffect, useState } from "react";
import axios from "axios";
import PolicyCard from "../components/PolicyCard";
import "./Policies.css";

function Policies() {
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [policyType, setPolicyType] = useState("");
  const [coverage, setCoverage] = useState("");

  useEffect(() => {
    const fetchPolicies = async () => {
      try {
        const response = await axios.get("/api/policies");
        setPolicies(response.data.policies);
      } catch (error) {
        console.error("Error fetching policies:", error);
        setError("Failed to load policies.");
      } finally {
        setLoading(false);
      }
    };

    fetchPolicies();
  }, []);

  if (loading) {
    return (
      <div className="policies-page">
        <div className="policies-state">
          Loading policies...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="policies-page">
        <div className="policies-state">
          {error}
        </div>
      </div>
    );
  }

  const filteredPolicies = policies.filter((policy) => {
    const searchText = search.toLowerCase();

    const matchesSearch =
      policy.policyName.toLowerCase().includes(searchText) ||
      policy.insuranceCompany.toLowerCase().includes(searchText);

    const matchesType =
      policyType === "" ||
      policy.policyType.includes(policyType);

    const matchesCoverage =
      coverage === "" ||
      policy.coverageAmounts.includes(Number(coverage));

    return matchesSearch && matchesType && matchesCoverage;
  });

  return (
    <div className="policies-page">

      {/* Page Header */}
      <div className="policies-header">
        <h1>Health Insurance Policies</h1>

        <p>
          Browse and compare health insurance policies available
          in the InsureLens catalog.
        </p>
      </div>

      {/* Search and Filters */}
      <div className="policy-filters">

        <input
          type="text"
          placeholder="Search policy or insurance company..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          value={policyType}
          onChange={(e) => setPolicyType(e.target.value)}
        >
          <option value="">All Policy Types</option>
          <option value="Individual">Individual</option>
          <option value="Family Floater">Family Floater</option>
          <option value="Senior Citizen">Senior Citizen</option>
          <option value="Critical Illness">Critical Illness</option>
        </select>

        <select
          value={coverage}
          onChange={(e) => setCoverage(e.target.value)}
        >
          <option value="">All Coverage Amounts</option>
          <option value="300000">₹3 Lakh</option>
          <option value="500000">₹5 Lakh</option>
          <option value="750000">₹7.5 Lakh</option>
          <option value="1000000">₹10 Lakh</option>
          <option value="1500000">₹15 Lakh</option>
          <option value="2000000">₹20 Lakh</option>
          <option value="2500000">₹25 Lakh</option>
          <option value="5000000">₹50 Lakh</option>
          <option value="10000000">₹1 Crore</option>
        </select>

      </div>

      {/* Results Count */}
      <p className="policy-count">
        Showing {filteredPolicies.length} of {policies.length} policies
      </p>

      {/* Policies */}
      {filteredPolicies.length > 0 ? (

        <div className="policies-container">
          {filteredPolicies.map((policy) => (
            <PolicyCard
              key={policy._id}
              policy={policy}
            />
          ))}
        </div>

      ) : (

        <div className="policies-state">
          No policies found matching your filters.
        </div>

      )}

    </div>
  );
}

export default Policies;