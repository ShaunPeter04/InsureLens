
const ML_SERVICE_URL = process.env.ML_SERVICE_URL;

async function predictRejectionML(rejectionReason, insurerRemarks = "") {
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

    return {
      available: true,
      ...result,
    };
  } catch (error) {
    console.error("Rejection ML prediction failed:", error.message);

    return {
      available: false,
      error: "ML prediction temporarily unavailable",
    };
  }
}

module.exports = { predictRejectionML };
