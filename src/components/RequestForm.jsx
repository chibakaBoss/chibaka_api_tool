import React, { useState } from "react";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";

export default function RequestForm({ onSaveTestCase }) {
  const [method, setMethod] = useState("GET");
  const [url, setUrl] = useState("");

  // Headers
  const [headers, setHeaders] = useState([{ key: "Content-Type", value: "application/json" }]);

  // Authorization
  const [authType, setAuthType] = useState("None");
  const [auth, setAuth] = useState({
    token: "",
    username: "",
    password: "",
    apiKey: "",
    apiKeyLocation: "header",
    apiKeyName: "x-api-key"
  });

  // Body
  const [bodyType, setBodyType] = useState("raw"); // "raw" or "form-data"
  const [rawBody, setRawBody] = useState("{}");
  const [formData, setFormData] = useState([{ key: "", value: "" }]);

  // Test case save fields
  const [caseName, setCaseName] = useState("");
  const [expectedStatus, setExpectedStatus] = useState("200");
  const [maxResponseTime, setMaxResponseTime] = useState("5");

  // Response + loading
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [formErrors, setFormErrors] = useState({});
  const [notice, setNotice] = useState("");

  const clearError = field => {
    setFormErrors(prev => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const validateRequest = (options = {}) => {
    const { requireCaseName = false } = options;
    const nextErrors = {};
    const trimmedUrl = url.trim();

    if (!trimmedUrl) {
      nextErrors.url = "URL is required.";
    } else if (!/^https?:\/\//i.test(trimmedUrl)) {
      nextErrors.url = "URL must start with http:// or https://";
    }

    if (!expectedStatus) {
      nextErrors.expectedStatus = "Expected status is required.";
    } else if (Number.isNaN(Number(expectedStatus))) {
      nextErrors.expectedStatus = "Expected status must be a number.";
    }

    if (maxResponseTime) {
      const numericMax = Number(maxResponseTime);
      if (Number.isNaN(numericMax) || numericMax <= 0) {
        nextErrors.maxResponseTime = "Max response time must be greater than zero.";
      }
    }

    if (requireCaseName && !caseName.trim()) {
      nextErrors.caseName = "Case name is required.";
    }

    setNotice("");
    setFormErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const buildBody = (mode = "request") => {
    if (method === "GET") {
      return { body: undefined, warning: null, isFormData: false };
    }

    if (bodyType === "raw") {
      const trimmed = rawBody.trim();
      if (!trimmed) {
        return { body: undefined, warning: null, isFormData: false };
      }

      try {
        return { body: JSON.parse(rawBody), warning: null, isFormData: false };
      } catch {
        const warning = `Raw body is not valid JSON; ${mode === "request" ? "sending" : "saving"} as text.`;
        return { body: rawBody, warning, isFormData: false };
      }
    }

    if (bodyType === "form-data") {
      if (mode === "storage") {
        const obj = {};
        formData.forEach(f => { if (f.key) obj[f.key] = f.value; });
        return { body: obj, warning: null, isFormData: false };
      }

      const fd = new FormData();
      let hasEntries = false;
      formData.forEach(({ key, value }) => {
        if (key) {
          fd.append(key, value);
          hasEntries = true;
        }
      });

      return { body: hasEntries ? fd : undefined, warning: null, isFormData: true };
    }

    return { body: undefined, warning: null, isFormData: false };
  };

  // --- Headers ---
  const handleHeaderChange = (idx, field, value) => {
    setHeaders(prev => prev.map((h, i) => i === idx ? { ...h, [field]: value } : h));
  };
  const addHeader = () => setHeaders(prev => [...prev, { key: "", value: "" }]);
  const removeHeader = idx => setHeaders(prev => prev.filter((_, i) => i !== idx));

  // --- Form-data ---
  const handleFormDataChange = (idx, field, value) => {
    setFormData(prev => prev.map((f, i) => i === idx ? { ...f, [field]: value } : f));
  };
  const addFormDataField = () => setFormData(prev => [...prev, { key: "", value: "" }]);
  const removeFormDataField = idx => setFormData(prev => prev.filter((_, i) => i !== idx));

  // --- Build headers with auth ---
  const buildHeaders = (options = {}) => {
    const { isFormData } = options;
    const h = {};
    headers.forEach(hd => { if(hd.key) h[hd.key] = hd.value; });

    if (authType === "Bearer" && auth.token) h["Authorization"] = `Bearer ${auth.token}`;
    if (authType === "Basic" && auth.username && auth.password) {
      h["Authorization"] = "Basic " + btoa(`${auth.username}:${auth.password}`);
    }
    if (authType === "ApiKey" && auth.apiKey && auth.apiKeyLocation === "header") {
      const headerName = auth.apiKeyName?.trim() || "x-api-key";
      h[headerName] = auth.apiKey;
    }

    if (isFormData) {
      Object.keys(h).forEach(key => {
        if (key.toLowerCase() === "content-type") {
          delete h[key];
        }
      });
    }

    return h;
  };

  // --- Build body ---
  const handleExpectedStatusInput = value => {
    if (/^\d*$/.test(value)) {
      setExpectedStatus(value);
      clearError("expectedStatus");
    }
  };

  const handleMaxResponseTimeInput = value => {
    if (/^\d*\.?\d*$/.test(value)) {
      setMaxResponseTime(value);
      clearError("maxResponseTime");
    }
  };

  // --- Send request ---
  const handleSend = async () => {
    if (!validateRequest()) return;

    const { body, warning, isFormData } = buildBody();
    setNotice(warning || "");
    setLoading(true);
    setResponse(null);
    const start = Date.now();

    try {
      let finalUrl = url.trim();
      if (authType === "ApiKey" && auth.apiKey && auth.apiKeyLocation === "query") {
        const paramName = auth.apiKeyName?.trim() || "apiKey";
        const param = `${encodeURIComponent(paramName)}=${encodeURIComponent(auth.apiKey)}`;
        finalUrl += (finalUrl.includes("?") ? "&" : "?") + param;
      }

      const timeoutSeconds = maxResponseTime ? Number(maxResponseTime) : undefined;
      const timeoutMs = timeoutSeconds && timeoutSeconds > 0 ? timeoutSeconds * 1000 : undefined;

      const requestConfig = {
        method,
        url: finalUrl,
        headers: buildHeaders({ isFormData }),
        validateStatus: () => true // prevent axios throwing for non-2xx
      };

      if (body !== undefined) requestConfig.data = body;
      if (timeoutMs) requestConfig.timeout = timeoutMs;

      const res = await axios(requestConfig);

      const elapsed = Date.now() - start;
      const expectedNumber = Number(expectedStatus);
      const isOk = res.status === expectedNumber;

      setResponse({
        ok: isOk,
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
        data: res.data,
        timeMs: elapsed
      });
    } catch(err) {
      const elapsed = Date.now() - start;
      setResponse({
        ok: false,
        timeMs: elapsed,
        status: err.response?.status,
        statusText: err.response?.statusText,
        headers: err.response?.headers,
        data: err.response?.data,
        error: err.message
      });
    } finally { setLoading(false); }
  };


  // --- Save test case ---
  const handleSave = e => {
    e.preventDefault();
    if (!validateRequest({ requireCaseName: true })) return;

    const bodyForStorage = buildBody("storage");
    let feedbackMessage = bodyForStorage.warning ? `${bodyForStorage.warning} Test case saved.` : "Test case saved.";

    const caseId = uuidv4();
    const expectedNumber = Number(expectedStatus);
    const timeoutSeconds = maxResponseTime ? Number(maxResponseTime) : null;

    const testCase = {
      id: caseId,
      caseName: caseName.trim(),
      method,
      url: url.trim(),
      headers: headers.map(h => ({ ...h })),
      authType,
      auth: { ...auth },
      bodyType,
      rawBody,
      formData: formData.map(f => ({ ...f })),
      body: bodyForStorage.body,
      expectedStatus: Number.isNaN(expectedNumber) ? null : expectedNumber,
      maxResponseTime: timeoutSeconds && timeoutSeconds > 0 ? timeoutSeconds : null
    };

    const allureStatus = response ? (response.ok ? "passed" : "failed") : "skipped";
    const allureCase = {
      uuid: caseId,
      name: caseName.trim(),
      status: allureStatus,
      statusDetails: response && !response.ok ? { message: `Expected ${expectedStatus}, got ${response.status}` } : {},
      stage: "finished",
      steps: [],
      attachments: [],
      parameters: [
        { name: "url", value: url.trim() },
        { name: "method", value: method }
      ]
    };

    const blob = new Blob([JSON.stringify(allureCase, null, 2)], { type: "application/json" });
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = `${caseName.replace(/\s+/g,"_")}.json`;
    a.click();
    URL.revokeObjectURL(downloadUrl);

    try {
      const saved = JSON.parse(localStorage.getItem("testCases") || "[]");
      saved.push(testCase);
      localStorage.setItem("testCases", JSON.stringify(saved));
    } catch (storageError) {
      console.error(storageError);
      feedbackMessage = `Failed to persist test case locally: ${storageError.message}`;
    }

    if (typeof onSaveTestCase === "function") {
      onSaveTestCase(testCase);
    }

    setNotice(feedbackMessage);
    setCaseName("");
    setExpectedStatus("200");
    setMaxResponseTime("5");
  };

  return (
    <form onSubmit={handleSave} style={{ border: "1px solid #ddd", padding: 12, borderRadius: 6 }}>
      {/* Method + URL */}
      <div style={{ display:"flex", gap:8, marginBottom:8 }}>
        <select value={method} onChange={e=>setMethod(e.target.value)}>
          <option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option>
        </select>
        <input
          style={{flex:1}}
          value={url}
          onChange={e=>{ setUrl(e.target.value); clearError("url"); }}
          placeholder="https://api.example.com/path"
        />
      </div>
      {formErrors.url && <div style={{color:"#d33", fontSize:12, marginBottom:8}}>{formErrors.url}</div>}

      {/* Headers */}
      <div style={{marginBottom:8}}>
        <div style={{fontWeight:600}}>Headers</div>
        {headers.map((h,i)=>(
          <div key={i} style={{display:"flex",gap:6,marginBottom:4}}>
            <input placeholder="Key" value={h.key} onChange={e=>handleHeaderChange(i,"key",e.target.value)} />
            <input placeholder="Value" value={h.value} onChange={e=>handleHeaderChange(i,"value",e.target.value)} />
            <button type="button" onClick={()=>removeHeader(i)}>✖</button>
          </div>
        ))}
        <button type="button" onClick={addHeader}>+ Add Header</button>
      </div>

      {/* Authorization */}
      <div style={{marginBottom:8}}>
        <div style={{fontWeight:600}}>Authorization</div>
        <select value={authType} onChange={e=>setAuthType(e.target.value)}>
          <option value="None">None</option>
          <option value="Bearer">Bearer Token</option>
          <option value="Basic">Basic Auth</option>
          <option value="ApiKey">API Key</option>
        </select>

        {authType === "Bearer" && <input type="text" placeholder="Token" value={auth.token} onChange={e=>setAuth(prev => ({ ...prev, token: e.target.value }))} />}
        {authType === "Basic" && <>
          <input type="text" placeholder="Username" value={auth.username} onChange={e=>setAuth(prev => ({ ...prev, username: e.target.value }))} />
          <input type="password" placeholder="Password" value={auth.password} onChange={e=>setAuth(prev => ({ ...prev, password: e.target.value }))} />
        </>}
        {authType === "ApiKey" && <>
          <input type="text" placeholder="API Key" value={auth.apiKey} onChange={e=>setAuth(prev => ({ ...prev, apiKey: e.target.value }))} />
          <select value={auth.apiKeyLocation} onChange={e=>setAuth(prev => {
            const nextLocation = e.target.value;
            const fallback = nextLocation === "header" ? "x-api-key" : "apiKey";
            const currentName = prev.apiKeyName?.trim();
            const shouldReset = !currentName ||
              (nextLocation === "query" && currentName.toLowerCase() === "x-api-key") ||
              (nextLocation === "header" && currentName.toLowerCase() === "apikey");
            return {
              ...prev,
              apiKeyLocation: nextLocation,
              apiKeyName: shouldReset ? fallback : currentName
            };
          })}>
            <option value="header">In Header</option>
            <option value="query">In Query Params</option>
          </select>
          <input
            type="text"
            placeholder={auth.apiKeyLocation === "header" ? "Header name (e.g. x-api-key)" : "Query param name (e.g. apiKey)"}
            value={auth.apiKeyName}
            onChange={e=>setAuth(prev => ({ ...prev, apiKeyName: e.target.value }))}
          />
        </>}
      </div>

      {/* Body */}
      {method !== "GET" && <div style={{marginBottom:8}}>
        <div style={{fontWeight:600}}>Body</div>
        <select value={bodyType} onChange={e=>setBodyType(e.target.value)}>
          <option value="raw">Raw JSON</option>
          <option value="form-data">Form Data</option>
        </select>

        {bodyType === "raw" && <textarea rows={6} style={{width:"100%"}} value={rawBody} onChange={e=>setRawBody(e.target.value)} />}
        {bodyType === "form-data" && <div>
          {formData.map((f,i)=>(
            <div key={i} style={{display:"flex",gap:6,marginBottom:4}}>
              <input placeholder="Key" value={f.key} onChange={e=>handleFormDataChange(i,"key",e.target.value)} />
              <input placeholder="Value" value={f.value} onChange={e=>handleFormDataChange(i,"value",e.target.value)} />
              <button type="button" onClick={()=>removeFormDataField(i)}>✖</button>
            </div>
          ))}
          <button type="button" onClick={addFormDataField}>+ Add Field</button>
        </div>}
      </div>}

      {/* Send / Save */}
      <div style={{display:"flex",gap:8,marginBottom:8}}>
        <button type="button" onClick={handleSend} disabled={loading}>{loading ? "Sending..." : "Send"}</button>
      </div>
      {notice && <div style={{color:"#b26b00", fontSize:12, marginBottom:8}}>{notice}</div>}

      <div style={{borderTop:"1px solid #eee", paddingTop:8, display:"grid", gap:6}}>
        <input placeholder="Case Name" value={caseName} onChange={e=>{ setCaseName(e.target.value); clearError("caseName"); }} />
        {formErrors.caseName && <div style={{color:"#d33", fontSize:12}}>{formErrors.caseName}</div>}
        <input type="text" placeholder="Expected Status" value={expectedStatus} onChange={e=>handleExpectedStatusInput(e.target.value)} />
        {formErrors.expectedStatus && <div style={{color:"#d33", fontSize:12}}>{formErrors.expectedStatus}</div>}
        <input type="text" placeholder="Max Response Time sec" value={maxResponseTime} onChange={e=>handleMaxResponseTimeInput(e.target.value)} />
        {formErrors.maxResponseTime && <div style={{color:"#d33", fontSize:12}}>{formErrors.maxResponseTime}</div>}
        <button type="submit">Save</button>
      </div>

      {/* Response */}
      <div style={{marginTop:12}}>
        <div style={{fontWeight:600}}>Response</div>
        {response ? <pre style={{whiteSpace:"pre-wrap", fontFamily:"monospace", fontSize:12}}>
          {response.ok ? "✅ Success\n" : "❌ Failed\n"}
          {response.status && `Status: ${response.status} ${response.statusText}\n`}
          {response.timeMs && `Time: ${response.timeMs} ms\n`}
          {response.headers && `Headers: ${JSON.stringify(response.headers,null,2)}\n`}
          {response.data && `Body: ${JSON.stringify(response.data,null,2)}\n`}
          {response.error && `Error: ${response.error}`}
        </pre> : <div style={{color:"#666"}}>No response yet</div>}
      </div>
    </form>
  );
}
