const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 1000;
const score = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
function validMLPrediction(p) {
  return p && typeof p === 'object' && !Array.isArray(p) &&
    text(p.primaryPrediction) && text(p.decisionTreePrediction) && text(p.primaryModel) &&
    typeof p.modelAgreement === 'boolean' && typeof p.requiresManualReview === 'boolean' &&
    score(p.highestClassScore) && p.classScores && typeof p.classScores === 'object' && !Array.isArray(p.classScores) &&
    Object.keys(p.classScores).length > 0 && Object.keys(p.classScores).length <= 100 &&
    Object.entries(p.classScores).every(([name, value]) => text(name) && score(value)) &&
    Array.isArray(p.reviewReasons) && p.reviewReasons.length <= 100 && p.reviewReasons.every(text) &&
    text(p.evaluationNote);
}
module.exports = { validMLPrediction };
