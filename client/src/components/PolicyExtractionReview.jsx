import { useState } from 'react';

export default function PolicyExtractionReview({ review }) {
  const [acknowledged, setAcknowledged] = useState(false);
  if (!review) return null;
  return <div className="policy-extraction-review">
    <h3>Review uploaded policy terms</h3>
    <p>{review.message}</p>
    <p>Policy number, sum insured and dates were manually entered. Extracted values remain unverified.</p>
    <ul>{review.fields.map(item => <li key={item.field}>
      <strong>{item.field.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('.', ' — ')}:</strong> {item.value == null ? 'Unknown' : typeof item.value === 'boolean' ? (item.value ? 'Yes' : 'No') : item.value} — {item.status}
    </li>)}</ul>
    <label><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} /> I have reviewed these fields against my original policy.</label>
    <p>{acknowledged ? 'Review acknowledged. This does not certify coverage; unknown terms still require insurer confirmation.' : 'Review is required. These extracted terms must not be treated as verified coverage.'}</p>
  </div>;
}
