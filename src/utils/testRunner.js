import axios from "axios";
import JSZip from "jszip";
import { v4 as uuidv4 } from "uuid";

const ensureTrimmed = value => (typeof value === "string" ? value.trim() : value);

const asNumber = value => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const formatDuration = ms => {
  if (!Number.isFinite(ms)) return "-";
  if (ms >= 1000) {
    const seconds = ms / 1000;
    return `${seconds.toFixed(seconds >= 10 ? 0 : 2)} s`;
  }
  return `${ms} ms`;
};

const formatDateTime = iso => {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

const escapeHtml = value => {
  const raw = ensureTrimmed(value ?? "");
  const str = String(raw);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const buildHeaders = (testCase, { isFormData }) => {
  const headers = {};
  (testCase.headers || []).forEach(({ key, value }) => {
    if (!key) return;
    headers[key] = value;
  });

  const authType = testCase.authType;
  const auth = testCase.auth || {};

  if (authType === "Bearer" && auth.token) {
    headers["Authorization"] = `Bearer ${auth.token}`;
  }

  if (authType === "Basic" && auth.username && auth.password) {
    headers["Authorization"] = "Basic " + btoa(`${auth.username}:${auth.password}`);
  }

  if (authType === "ApiKey" && auth.apiKey && auth.apiKeyLocation === "header") {
    const headerName = auth.apiKeyName?.trim() || "x-api-key";
    headers[headerName] = auth.apiKey;
  }

  if (isFormData) {
    Object.keys(headers).forEach(key => {
      if (key.toLowerCase() === "content-type") {
        delete headers[key];
      }
    });
  }

  return headers;
};

const buildBody = testCase => {
  const method = (testCase.method || "GET").toUpperCase();
  if (method === "GET") {
    return { data: undefined, isFormData: false, warning: null };
  }

  if (testCase.bodyType === "raw") {
    const raw = ensureTrimmed(testCase.rawBody ?? "");
    if (!raw) {
      return { data: undefined, isFormData: false, warning: null };
    }

    try {
      return { data: JSON.parse(raw), isFormData: false, warning: null };
    } catch {
      return { data: testCase.rawBody ?? raw, isFormData: false, warning: "Raw body is not valid JSON; sending as text." };
    }
  }

  if (testCase.bodyType === "form-data") {
    const fd = typeof FormData !== "undefined" ? new FormData() : null;
    let hasEntries = false;

    (testCase.formData || []).forEach(({ key, value }) => {
      if (!key) return;
      hasEntries = true;
      if (fd) {
        fd.append(key, value);
      }
    });

    if (!hasEntries) {
      return { data: undefined, isFormData: false, warning: null };
    }

    if (fd) {
      return { data: fd, isFormData: true, warning: null };
    }

    // Fallback for non-browser environments
    const obj = {};
    (testCase.formData || []).forEach(({ key, value }) => {
      if (!key) return;
      obj[key] = value;
    });
    return { data: obj, isFormData: false, warning: null };
  }

  return { data: undefined, isFormData: false, warning: null };
};

export async function runTestCase(testCase) {
  const method = (testCase.method || "GET").toUpperCase();
  let finalUrl = ensureTrimmed(testCase.url || "");
  if (!finalUrl) {
    throw new Error("Missing URL for test case.");
  }

  const authType = testCase.authType;
  const auth = testCase.auth || {};
  if (authType === "ApiKey" && auth.apiKey && auth.apiKeyLocation === "query") {
    const paramName = auth.apiKeyName?.trim() || "apiKey";
    const param = `${encodeURIComponent(paramName)}=${encodeURIComponent(auth.apiKey)}`;
    finalUrl += (finalUrl.includes("?") ? "&" : "?") + param;
  }

  const { data, isFormData, warning } = buildBody(testCase);
  const headers = buildHeaders(testCase, { isFormData });

  const timeoutSeconds = asNumber(testCase.maxResponseTime);
  const requestConfig = {
    method,
    url: finalUrl,
    headers,
    validateStatus: () => true
  };

  if (timeoutSeconds && timeoutSeconds > 0) {
    requestConfig.timeout = timeoutSeconds * 1000;
  }

  if (data !== undefined) {
    requestConfig.data = data;
  }

  const start = Date.now();
  try {
    const response = await axios(requestConfig);
    const elapsed = Date.now() - start;
    const expectedStatus = asNumber(testCase.expectedStatus);
    const ok = expectedStatus != null ? response.status === expectedStatus : response.status >= 200 && response.status < 300;

    return {
      caseId: testCase.id,
      caseName: testCase.caseName,
      ok,
      status: response.status,
      statusText: response.statusText,
      timeMs: elapsed,
      expectedStatus,
      warning,
      executedAt: new Date().toISOString(),
      error: null
    };
  } catch (error) {
    const elapsed = Date.now() - start;
    return {
      caseId: testCase.id,
      caseName: testCase.caseName,
      ok: false,
      status: error.response?.status,
      statusText: error.response?.statusText,
      timeMs: elapsed,
      expectedStatus: asNumber(testCase.expectedStatus),
      warning,
      executedAt: new Date().toISOString(),
      error: error.message
    };
  }
}

const escapeXml = value => {
  const raw = ensureTrimmed(value ?? "");
  const str = String(raw);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
};

export function generateJUnitReport(testCases, results) {
  const total = testCases.length;
  const failures = results.filter(r => !r.ok).length;
  const casesById = Object.fromEntries(testCases.map(tc => [tc.id, tc]));

  const testCaseEntries = results.map(result => {
    const target = casesById[result.caseId] || {};
    const fallbackName = `${target.method || result.caseName || ""} ${target.url || ""}`.trim();
    const name = target.caseName || result.caseName || fallbackName || "Unnamed Case";
    const failureBlock = result.ok ? "" : `<failure message="Expected ${result.expectedStatus ?? "2xx"}, got ${result.status ?? "error"}">${result.error || "Request failed"}</failure>`;
    return `    <testcase classname="API" name="${escapeXml(name)}" time="${(result.timeMs || 0) / 1000}">
${failureBlock ? `      ${failureBlock}\n` : ""}    </testcase>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="API Tests" tests="${total}" failures="${failures}">\n${testCaseEntries}\n</testsuite>`;
}

export async function generateAllureArchive(testCases, results, options = {}) {
  const casesById = Object.fromEntries(testCases.map(tc => [tc.id, tc]));
  const runTimestamp = new Date();
  const zip = new JSZip();
  const resultsFolder = zip.folder("allure-results");
  if (!resultsFolder) throw new Error("Failed to prepare allure-results folder.");

  const executor = {
    name: options.executorName || "Browser Runner",
    type: "browser",
    buildOrder: options.buildOrder ?? undefined,
    reportName: options.reportName || `API Suite ${runTimestamp.toISOString()}`,
    reportUrl: options.reportUrl || undefined,
    buildUrl: options.buildUrl || undefined
  };

  resultsFolder.file("executor.json", JSON.stringify(executor, null, 2));

  results.forEach(result => {
    const relatedCase = casesById[result.caseId] || {};
    const method = relatedCase.method || "GET";
    const url = relatedCase.url || "";
    const name = relatedCase.caseName || result.caseName || `${method} ${url}`.trim() || "Unnamed Case";
    const start = runTimestamp.getTime() - (result.timeMs || 0);
    const stop = runTimestamp.getTime();
    const status = result.ok ? "passed" : "failed";
    const uuid = uuidv4();
    const historyId = relatedCase.id || result.caseId || uuid;

    let statusDetails;
    if (!result.ok) {
      statusDetails = {
        message: result.error || `Expected ${result.expectedStatus ?? "2xx"}, got ${result.status ?? "error"}`,
        trace: result.warning || undefined
      };
    } else if (result.warning) {
      statusDetails = { message: result.warning };
    }

    const parameters = [
      { name: "method", value: method },
      { name: "url", value: url }
    ];

    if (result.expectedStatus != null) {
      parameters.push({ name: "expectedStatus", value: String(result.expectedStatus) });
    }

    const allureResult = {
      uuid,
      historyId,
      name,
      fullName: `${method} ${url}`.trim() || name,
      status,
      stage: "finished",
      statusDetails,
      start,
      stop,
      time: result.timeMs || 0,
      labels: [
        { name: "suite", value: "API" },
        { name: "framework", value: "axios" }
      ],
      parameters,
      steps: [],
      attachments: [],
      links: []
    };

    resultsFolder.file(`${uuid}-result.json`, JSON.stringify(allureResult, null, 2));
  });

  return zip.generateAsync({ type: "blob" });
}

export function generateAllureHtml(testCases, results, meta = {}) {
  const casesById = Object.fromEntries(testCases.map(tc => [tc.id, tc]));
  const total = results.length;
  const passed = results.filter(r => r.ok).length;
  const failed = total - passed;
  const warnings = results.filter(r => r.warning).length;
  const totalDuration = results.reduce((acc, res) => acc + (res.timeMs || 0), 0);
  const executedAt = meta.executedAt || new Date().toISOString();
  const executedDisplay = formatDateTime(executedAt);

  const filterButtons = [
    { key: "all", label: `All (${total})` },
    { key: "passed", label: `Passed (${passed})` },
    { key: "failed", label: `Failed (${failed})` },
    { key: "warning", label: `Warnings (${warnings})` }
  ];

  const filterControls = filterButtons
    .map((btn, index) => `
        <button class="filter${index === 0 ? " is-active" : ""}" data-filter="${btn.key}">
          ${escapeHtml(btn.label)}
        </button>
      `)
    .join("");

  const caseCards = results.map((result, idx) => {
    const target = casesById[result.caseId] || {};
    const method = target.method || "GET";
    const url = target.url || "";
    const fallbackName = `${method} ${url}`.trim();
    const name = target.caseName || result.caseName || fallbackName || `Case #${idx + 1}`;
    const statusClass = result.ok ? "case--passed" : "case--failed";
    const statusLabel = result.ok ? "Passed" : "Failed";
    const expected = result.expectedStatus != null ? result.expectedStatus : "—";
    const actual = result.status != null ? result.status : "—";
    const executed = formatDateTime(result.executedAt);
    const warningBlock = result.warning
      ? `<div class="case__alert case__alert--warning">⚠️ ${escapeHtml(result.warning)}</div>`
      : "";
    const errorBlock = result.error
      ? `<div class="case__alert case__alert--error">🔥 ${escapeHtml(result.error)}</div>`
      : "";

    return `
      <article class="case ${statusClass}" data-status="${result.ok ? "passed" : "failed"}" data-warning="${result.warning ? "true" : "false"}">
        <header class="case__header">
          <span class="case__status">${statusLabel}</span>
          <h2 class="case__name">${escapeHtml(name)}</h2>
        </header>
        <div class="case__meta">
          <span>${escapeHtml(method)}</span>
          <span>Expected ${escapeHtml(expected)}</span>
          <span>Actual ${escapeHtml(actual)}</span>
          <span>${escapeHtml(formatDuration(result.timeMs))}</span>
        </div>
        <div class="case__url">${escapeHtml(url)}</div>
        <div class="case__timeline">Ran at ${escapeHtml(executed)}</div>
        ${warningBlock}
        ${errorBlock}
      </article>
    `;
  }).join("");

  const casesSection = caseCards || `<div class="empty">No test cases were executed.</div>`;

  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <title>Allure Report Preview</title>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        body { font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif; margin: 0; background: linear-gradient(135deg, #0f172a 0%, #111827 100%); color: #e2e8f0; }
        .shell { max-width: 1100px; margin: 0 auto; padding: 3rem 1.5rem 4rem; }
        .header { margin-bottom: 2.5rem; }
        .header h1 { margin: 0 0 0.5rem; font-size: clamp(1.8rem, 2vw + 1.2rem, 2.8rem); letter-spacing: 0.05em; text-transform: uppercase; color: #38bdf8; }
        .header p { margin: 0; font-size: 0.95rem; color: rgba(226, 232, 240, 0.75); }
        .summary { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); margin-bottom: 2rem; }
        .card { background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 16px; padding: 1.25rem; box-shadow: 0 20px 50px rgba(15, 23, 42, 0.45); }
        .card h3 { margin: 0 0 0.4rem; font-size: 0.85rem; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(148, 163, 184, 0.9); }
        .card span { font-size: 1.9rem; font-weight: 700; }
        .card--pass span { color: #4ade80; }
        .card--fail span { color: #f87171; }
        .card--warn span { color: #facc15; }
        .filters { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 2rem; }
        .filter { border: 1px solid rgba(148, 163, 184, 0.4); background: rgba(15, 23, 42, 0.7); color: #f1f5f9; border-radius: 999px; padding: 0.5rem 1rem; cursor: pointer; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; transition: all 0.18s ease; }
        .filter:hover { border-color: rgba(56, 189, 248, 0.8); color: #38bdf8; }
        .filter.is-active { background: #38bdf8; color: #0f172a; box-shadow: 0 12px 30px rgba(56, 189, 248, 0.35); }
        .cases { display: grid; gap: 1.25rem; }
        .case { background: rgba(15, 23, 42, 0.85); border-radius: 18px; padding: 1.5rem; border: 1px solid transparent; box-shadow: 0 25px 40px rgba(15, 23, 42, 0.45); transition: transform 0.18s ease, border-color 0.18s ease; }
        .case:hover { transform: translateY(-4px); border-color: rgba(56, 189, 248, 0.5); }
        .case--passed { border-color: rgba(74, 222, 128, 0.35); }
        .case--failed { border-color: rgba(248, 113, 113, 0.4); }
        .case__header { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; margin-bottom: 0.6rem; }
        .case__status { padding: 0.25rem 0.75rem; border-radius: 999px; font-size: 0.75rem; letter-spacing: 0.08em; text-transform: uppercase; background: rgba(56, 189, 248, 0.18); color: #38bdf8; }
        .case--passed .case__status { background: rgba(74, 222, 128, 0.2); color: #4ade80; }
        .case--failed .case__status { background: rgba(248, 113, 113, 0.2); color: #f87171; }
        .case__name { margin: 0; font-size: 1.25rem; color: #f8fafc; }
        .case__meta { display: flex; flex-wrap: wrap; gap: 0.75rem; font-size: 0.8rem; color: rgba(148, 163, 184, 0.85); margin-bottom: 0.8rem; }
        .case__url { font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace; font-size: 0.85rem; color: #38bdf8; margin-bottom: 0.75rem; word-break: break-all; }
        .case__timeline { font-size: 0.78rem; color: rgba(226, 232, 240, 0.65); margin-bottom: 0.65rem; }
        .case__alert { padding: 0.6rem 0.8rem; border-radius: 12px; font-size: 0.82rem; margin-top: 0.5rem; }
        .case__alert--warning { background: rgba(251, 191, 36, 0.18); color: #facc15; border: 1px solid rgba(251, 191, 36, 0.3); }
        .case__alert--error { background: rgba(248, 113, 113, 0.2); color: #f87171; border: 1px solid rgba(248, 113, 113, 0.35); }
        .empty { border: 1px dashed rgba(148, 163, 184, 0.4); border-radius: 16px; padding: 2.5rem 1.5rem; text-align: center; color: rgba(226, 232, 240, 0.65); }
        footer { margin-top: 3rem; font-size: 0.75rem; color: rgba(148, 163, 184, 0.55); text-align: center; }
        @media (max-width: 720px) {
          .shell { padding: 2.5rem 1.1rem 3rem; }
          .cases { gap: 1rem; }
        }
      </style>
    </head>
    <body>
      <div class="shell">
        <header class="header">
          <h1>Allure Report Preview</h1>
          <p>Generated ${escapeHtml(executedDisplay)} · Total duration ${escapeHtml(formatDuration(totalDuration))}</p>
        </header>
        <section class="summary">
          <div class="card">
            <h3>Total</h3>
            <span>${escapeHtml(String(total))}</span>
          </div>
          <div class="card card--pass">
            <h3>Passed</h3>
            <span>${escapeHtml(String(passed))}</span>
          </div>
          <div class="card card--fail">
            <h3>Failed</h3>
            <span>${escapeHtml(String(failed))}</span>
          </div>
          <div class="card card--warn">
            <h3>Warnings</h3>
            <span>${escapeHtml(String(warnings))}</span>
          </div>
        </section>
        <div class="filters">
          ${filterControls}
        </div>
        <section class="cases">
          ${casesSection}
        </section>
        <footer>
          Preview generated in the browser. Exported Allure results are available in the downloaded ZIP.
        </footer>
      </div>
      <script>
        (function() {
          const buttons = Array.from(document.querySelectorAll('.filter'));
          const cards = Array.from(document.querySelectorAll('.case'));
          const applyFilter = key => {
            buttons.forEach(btn => btn.classList.toggle('is-active', btn.dataset.filter === key));
            cards.forEach(card => {
              if (!card) return;
              const status = card.dataset.status;
              const warning = card.dataset.warning === 'true';
              let show = true;
              if (key === 'passed') show = status === 'passed';
              if (key === 'failed') show = status === 'failed';
              if (key === 'warning') show = warning;
              card.style.display = show ? '' : 'none';
            });
          };
          buttons.forEach(btn => btn.addEventListener('click', () => applyFilter(btn.dataset.filter)));
          applyFilter('all');
        })();
      </script>
    </body>
  </html>`;
}
