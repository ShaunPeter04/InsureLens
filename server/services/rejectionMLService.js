
const { validMLPrediction } = require("../utils/mlPredictionValidation");

async function predictRejectionML(rejectionReason, insurerRemarks = "") {
  const ML_SERVICE_URL = process.env.ML_SERVICE_URL?.trim();
  if (!ML_SERVICE_URL) {
    return {
      available: false,
      error: "ML service URL is not configured",
    };
  }

  try {
    const response = await fetch(
      `${ML_SERVICE_URL.replace(/\/$/, "")}/predict-rejection`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rejectionReason,
          insurerRemarks,
        }),
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!response.ok) {
      throw new Error(`ML service returned HTTP ${response.status}`);
    }

    const result = await response.json();

    if (!validMLPrediction(result)) return {available:false, reason:"invalid_response", error:"ML service returned incomplete results. Rule-based results remain available."};
    return {...result, available:true, requiresManualReview:true};
  } catch (error) {


    if (error.name === "SyntaxError") return {available:false, reason:"invalid_response", error:"ML service returned an invalid response. Rule-based results remain available."};
    return {
      available: false,
      reason: ["TimeoutError", "AbortError"].includes(error.name) ? "timeout" : "unavailable",
      error: ["TimeoutError", "AbortError"].includes(error.name) ? "ML prediction timed out. Rule-based results remain available." : "ML prediction temporarily unavailable. Rule-based results remain available.",
    };
  }
}

module.exports = { predictRejectionML };
