import React from "react";
import "./TestCaseList.css";

const formatTimestamp = iso => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

export default function TestCaseList({
  testCases,
  onRunAll,
  isRunning,
  lastRunSummary,
  reportAvailable,
  onOpenReport,
  previewNotice
}) {
  const hasCases = testCases.length > 0;

  return (
    <section className="test-case-list">
      <div className="test-case-list__header">
        <div>
          <h3 className="test-case-list__title">Saved Test Cases</h3>
          {lastRunSummary && (
            <div className="test-case-list__last-run">Last run: {formatTimestamp(lastRunSummary.executedAt)}</div>
          )}
        </div>
        <span className="test-case-list__count">{hasCases ? `${testCases.length} saved` : "No cases yet"}</span>
      </div>

      {hasCases ? (
        <>
          <ul className="test-case-list__items">
            {testCases.map((tc, idx) => (
              <li key={tc.id || `${tc.caseName}-${idx}`} className="test-case-list__item">
                <div className="test-case-list__meta">
                  <span>{tc.method}</span>
                  {tc.expectedStatus && <span>Expect {tc.expectedStatus}</span>}
                </div>
                <div className="test-case-list__name">{tc.caseName || `Case #${idx + 1}`}</div>
                <div className="test-case-list__url">{tc.url}</div>
                <div className="test-case-list__status">
                  {tc.lastRun ? (
                    <span className={`test-case-list__badge ${tc.lastRun.ok ? "test-case-list__badge--success" : "test-case-list__badge--error"}`}>
                      {tc.lastRun.ok ? "Passed" : "Failed"}
                      {tc.lastRun.status && ` • ${tc.lastRun.status}`}
                    </span>
                  ) : (
                    <span className="test-case-list__badge test-case-list__badge--pending">Not run yet</span>
                  )}
                  {tc.lastRun && (
                    <span className="test-case-list__status-meta">
                      {tc.lastRun.timeMs != null && `${tc.lastRun.timeMs} ms`} · {formatTimestamp(tc.lastRun.executedAt)}
                    </span>
                  )}
                  {tc.lastRun?.warning && <span className="test-case-list__warning">{tc.lastRun.warning}</span>}
                  {tc.lastRun?.error && <span className="test-case-list__error">{tc.lastRun.error}</span>}
                </div>
              </li>
            ))}
          </ul>
          <div className="test-case-list__actions">
            <button
              className="btn btn--primary test-case-list__run"
              onClick={onRunAll}
              disabled={isRunning || !hasCases}
            >
              {isRunning ? "Running..." : "Run All Tests"}
            </button>
            {reportAvailable && typeof onOpenReport === "function" && (
              <button
                type="button"
                className="btn btn--ghost test-case-list__open-report"
                onClick={onOpenReport}
              >
                Open Last Report
              </button>
            )}
          </div>
          {previewNotice && <div className="test-case-list__notice">{previewNotice}</div>}
        </>
      ) : (
        <div className="test-case-list__empty">
          Saved test cases will appear here after you press <strong>Save</strong> in the request form.
        </div>
      )}
      {previewNotice && !hasCases && <div className="test-case-list__notice">{previewNotice}</div>}
    </section>
  );
}
