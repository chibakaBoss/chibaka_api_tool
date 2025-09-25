import React from "react";

export default function TestCaseList({ testCases, onRunAll }) {
  return (
    <div>
      <ul>
        {testCases.map((tc, idx) => (
          <li key={idx}>{tc.method} {tc.url}</li>
        ))}
      </ul>
      {testCases.length > 0 && <button onClick={onRunAll}>Run All Tests</button>}
    </div>
  );
}
