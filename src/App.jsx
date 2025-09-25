import React, { useState } from "react";
import RequestForm from "./components/RequestForm";
import TestCaseList from "./components/TestCaseList";

export default function App() {
  const [testCases, setTestCases] = useState([]);

  const addTestCase = (tc) => setTestCases(prev => [...prev, tc]);

  const runAllTestCases = async () => {
    let xml = `<?xml version="1.0" encoding="UTF-8"?><testsuite name="API Tests" tests="${testCases.length}">`;
    for (const tc of testCases) {
      try {
        const response = await fetch(tc.url, { method: tc.method });
        const status = response.ok ? "PASSED" : "FAILED";
        xml += `<testcase classname="API" name="${tc.method} ${tc.url}">`;
        if (status !== "PASSED") xml += `<failure message="Failed"/>`;
        xml += `</testcase>`;
      } catch {
        xml += `<testcase classname="API" name="${tc.method} ${tc.url}"><failure message="Request error"/></testcase>`;
      }
    }
    xml += `</testsuite>`;

    // Download XML
    const blob = new Blob([xml], { type: "text/xml" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `report-${Date.now()}.xml`;
    link.click();
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>API Automation Tool</h2>
      <RequestForm onSaveTestCase={addTestCase} />
      <TestCaseList testCases={testCases} onRunAll={runAllTestCases} />
    </div>
  );
}
