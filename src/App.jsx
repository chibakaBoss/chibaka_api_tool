import React, { useEffect, useState } from "react";
import RequestForm from "./components/RequestForm";
import TestCaseList from "./components/TestCaseList";
import "./App.css";
import { v4 as uuidv4 } from "uuid";
import {
  runTestCase,
  generateJUnitReport,
  generateAllureArchive,
  generateAllureHtml
} from "./utils/testRunner";

export default function App() {
  const [testCases, setTestCases] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("testCases") || "[]");
      if (!Array.isArray(stored)) return [];
      return stored.map(tc => ({
        ...tc,
        id: tc.id || uuidv4()
      }));
    } catch {
      return [];
    }
  });

  const [isRunning, setIsRunning] = useState(false);
  const [lastRunSummary, setLastRunSummary] = useState(null);
  const [allurePreview, setAllurePreview] = useState(null);
  const [previewNotice, setPreviewNotice] = useState(null);

  useEffect(() => {
    localStorage.setItem("testCases", JSON.stringify(testCases));
  }, [testCases]);

  useEffect(() => {
    const handleStorage = event => {
      if (event.key !== "testCases") return;
      try {
        const next = JSON.parse(event.newValue || "[]");
        if (!Array.isArray(next)) return;
        setTestCases(prev => {
          const incoming = next.map(tc => ({ ...tc, id: tc.id || uuidv4() }));
          const serializedPrev = JSON.stringify(prev);
          const serializedNext = JSON.stringify(incoming);
          if (serializedPrev === serializedNext) return prev;
          return incoming;
        });
      } catch {
        /* ignore */
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const addTestCase = testCase => {
    setTestCases(prev => {
      const id = testCase.id || uuidv4();
      const nextCase = { ...testCase, id };
      return [...prev, nextCase];
    });
  };

  const createReportWindow = html => {
    if (typeof window === "undefined") return null;
    const win = window.open("", "_blank", "noopener");
    if (!win) return null;
    win.document.open();
    win.document.write(html);
    win.document.close();
    return win;
  };

  const updateReportWindow = (win, html) => {
    if (!win) return false;
    win.document.open();
    win.document.write(html);
    win.document.close();
    return true;
  };

  const buildLoadingHtml = () => `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <title>Preparing Allure Report...</title>
      <style>
        body { font-family: 'Segoe UI', system-ui, sans-serif; margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #0f172a; color: #e2e8f0; }
        .box { text-align: center; padding: 2.5rem 3rem; background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(148, 163, 184, 0.35); border-radius: 20px; box-shadow: 0 25px 50px rgba(15, 23, 42, 0.45); }
        .spinner { width: 3rem; height: 3rem; border-radius: 999px; border: 3px solid rgba(148, 163, 184, 0.35); border-top-color: #38bdf8; margin: 0 auto 1.25rem; animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        h1 { margin: 0 0 0.5rem; font-size: 1.25rem; letter-spacing: 0.08em; text-transform: uppercase; color: #38bdf8; }
        p { margin: 0; font-size: 0.95rem; color: #cbd5f5; }
      </style>
    </head>
    <body>
      <div class="box">
        <div class="spinner"></div>
        <h1>Generating</h1>
        <p>Your Allure dashboard is being prepared...</p>
      </div>
    </body>
  </html>`;

  const openAllurePreview = html => {
    const win = createReportWindow(html);
    if (!win) {
      setPreviewNotice("Your browser blocked the report popup. Allow pop-ups or use the button to open it manually.");
      return false;
    }
    setPreviewNotice(null);
    return true;
  };

  const handleOpenReport = () => {
    if (!allurePreview) return;
    openAllurePreview(allurePreview.html);
  };

  const runAllTestCases = async () => {
    if (!testCases.length || isRunning) return;

    setIsRunning(true);
    setPreviewNotice(null);

    const loadingWindow = createReportWindow(buildLoadingHtml());

    try {
      const results = [];
      for (const testCase of testCases) {
        try {
          const result = await runTestCase(testCase);
          results.push(result);
        } catch (error) {
          results.push({
            caseId: testCase.id,
            caseName: testCase.caseName,
            ok: false,
            status: null,
            statusText: "Request Failed",
            timeMs: 0,
            expectedStatus: null,
            executedAt: new Date().toISOString(),
            warning: null,
            error: error.message || "Unexpected error"
          });
        }
      }

      setTestCases(prev => prev.map(tc => {
        const match = results.find(res => res.caseId === tc.id);
        if (!match) return tc;
        return {
          ...tc,
          lastRun: {
            ok: match.ok,
            status: match.status,
            statusText: match.statusText,
            timeMs: match.timeMs,
            executedAt: match.executedAt,
            expectedStatus: match.expectedStatus,
            warning: match.warning || null,
            error: match.error || null
          }
        };
      }));

      const summaryExecutedAt = new Date().toISOString();
      setLastRunSummary({
        executedAt: summaryExecutedAt,
        results
      });

      const html = generateAllureHtml(testCases, results, { executedAt: summaryExecutedAt });
      setAllurePreview({ html, generatedAt: summaryExecutedAt });

      if (loadingWindow) {
        updateReportWindow(loadingWindow, html);
      } else if (!openAllurePreview(html)) {
        setPreviewNotice("Your browser blocked the report popup. Use 'Open last report' after enabling pop-ups.");
      }

      const xml = generateJUnitReport(testCases, results);
      const blob = new Blob([xml], { type: "text/xml" });
      const xmlUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = xmlUrl;
      link.download = `report-${Date.now()}.xml`;
      link.click();
      URL.revokeObjectURL(xmlUrl);

      try {
        const allureArchive = await generateAllureArchive(testCases, results);
        const allureUrl = URL.createObjectURL(allureArchive);
        const allureLink = document.createElement("a");
        allureLink.href = allureUrl;
        allureLink.download = `allure-results-${Date.now()}.zip`;
        allureLink.click();
        URL.revokeObjectURL(allureUrl);
      } catch (archiveError) {
        console.error(archiveError);
        setPreviewNotice(prev => prev || "Allure ZIP could not be generated. Report preview is still available.");
      }
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="app-shell">
      <div className="app-shell__inner">
        <header className="app-shell__header">
          <h1 className="app-shell__title">API Automation Tool</h1>
          <p className="app-shell__subtitle">
            Build, send, and save HTTP requests as reusable test cases, then export Allure-friendly reports.
          </p>
        </header>
        <main className="app-shell__main">
          <RequestForm onSaveTestCase={addTestCase} />
          <TestCaseList
            testCases={testCases}
            onRunAll={runAllTestCases}
            isRunning={isRunning}
            lastRunSummary={lastRunSummary}
            reportAvailable={Boolean(allurePreview)}
            onOpenReport={handleOpenReport}
            previewNotice={previewNotice}
          />
        </main>
      </div>
    </div>
  );
}
