/**
 * ApiTest – API integration test page
 *
 * Provides simple test buttons for each model adapter (Qwen, GPT-image-2,
 * Nano Banana 2, LLM expansion) with result display and error logs.
 *
 * Route: /api-test
 */

import React, { useState, useCallback, useRef } from 'react';
import { getModelAdapter, getLLMAdapter } from '../services/api';
import TaskEngine from '../services/task-engine';
import { useTaskStore } from '../stores/useTaskStore';

const DEFAULT_PROMPT = '一只橘猫坐在窗台上看雨，水彩风格，柔和色调';

const sectionStyle = {
  marginBottom: '24px',
  padding: '16px',
  border: '1px solid #e0e0e0',
  borderRadius: '8px',
  background: '#fafafa',
};

const btnStyle = (color) => ({
  padding: '8px 16px',
  border: 'none',
  borderRadius: '6px',
  background: color,
  color: '#fff',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: '600',
  marginRight: '8px',
  marginBottom: '8px',
});

const btnDisabledStyle = {
  ...btnStyle('#999'),
  cursor: 'not-allowed',
  opacity: 0.6,
};

const logEntryStyle = {
  fontFamily: 'monospace',
  fontSize: '12px',
  padding: '2px 0',
  borderBottom: '1px solid #eee',
};

const imgStyle = {
  maxWidth: '300px',
  maxHeight: '300px',
  borderRadius: '8px',
  border: '1px solid #ddd',
  marginTop: '8px',
  display: 'block',
};

export default function ApiTest() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [logs, setLogs] = useState([]);
  const [results, setResults] = useState({});  // modelId -> { status, images, error }
  const [running, setRunning] = useState({});  // modelId -> boolean
  const logRef = useRef(null);
  const tasks = useTaskStore((s) => s.tasks);

  const addLog = useCallback((msg, type = 'info') => {
    const entry = `[${new Date().toLocaleTimeString()}] [${type.toUpperCase()}] ${msg}`;
    console.log(entry);
    setLogs((prev) => [...prev, { msg: entry, type }]);
    // Auto-scroll
    setTimeout(() => {
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    }, 50);
  }, []);

  const setModelRunning = (modelId, isRunning) => {
    setRunning((prev) => ({ ...prev, [modelId]: isRunning }));
  };

  const setModelResult = (modelId, data) => {
    setResults((prev) => ({ ...prev, [modelId]: data }));
  };

  // ── Test Qwen Image 3 ──────────────────────────────────────────────────
  const testQwen = async () => {
    setModelRunning('qwen', true);
    setModelResult('qwen', { status: 'running', images: [] });
    addLog('Starting Qwen Image 3 T2I test...');

    try {
      const adapter = getModelAdapter('qwen-image-3');
      const result = await TaskEngine.submit({
        type: 'test',
        model: 'qwen-image-3',
        prompt,
        params: { size: '1024*1024', n: 1 },
        execute: async (ctx) => {
          addLog('Qwen: sending request to DashScope...');
          const res = await adapter.generateText2Image(prompt, { size: '1024*1024', n: 1 }, ctx.signal, (p) => {
            addLog(`Qwen progress: ${p}%`);
          });
          addLog(`Qwen: received ${res.images.length} image(s)`);
          return res;
        },
      });

      setModelResult('qwen', { status: 'success', images: result.images });
      addLog('Qwen test PASSED', 'success');
    } catch (err) {
      setModelResult('qwen', { status: 'error', error: err.message });
      addLog(`Qwen test FAILED: ${err.message}`, 'error');
    } finally {
      setModelRunning('qwen', false);
    }
  };

  // ── Test GPT-image-2 ───────────────────────────────────────────────────
  const testGPT = async () => {
    setModelRunning('gpt', true);
    setModelResult('gpt', { status: 'running', images: [] });
    addLog('Starting GPT-image-2 T2I test...');

    try {
      const adapter = getModelAdapter('gpt-image-2');
      const result = await TaskEngine.submit({
        type: 'test',
        model: 'gpt-image-2',
        prompt,
        params: { size: '1024x1024', n: 1 },
        execute: async (ctx) => {
          addLog('GPT-image-2: submitting task to EvoLink...');
          const res = await adapter.generateText2Image(prompt, { size: '1024x1024', n: 1 }, ctx.signal, (p) => {
            addLog(`GPT-image-2 progress: ${p}%`);
          });
          addLog(`GPT-image-2: received ${res.images.length} image(s)`);
          return res;
        },
      });

      setModelResult('gpt', { status: 'success', images: result.images });
      addLog('GPT-image-2 test PASSED', 'success');
    } catch (err) {
      setModelResult('gpt', { status: 'error', error: err.message });
      addLog(`GPT-image-2 test FAILED: ${err.message}`, 'error');
    } finally {
      setModelRunning('gpt', false);
    }
  };

  // ── Test Nano Banana 2 ─────────────────────────────────────────────────
  const testNano = async () => {
    setModelRunning('nano', true);
    setModelResult('nano', { status: 'running', images: [] });
    addLog('Starting Nano Banana 2 T2I test...');

    try {
      const adapter = getModelAdapter('nanobanana-2');
      const result = await TaskEngine.submit({
        type: 'test',
        model: 'nanobanana-2',
        prompt,
        params: { size: '1:1' },
        execute: async (ctx) => {
          addLog('Nano Banana 2: submitting task to EvoLink...');
          const res = await adapter.generateText2Image(prompt, { size: '1:1' }, ctx.signal, (p) => {
            addLog(`Nano Banana 2 progress: ${p}%`);
          });
          addLog(`Nano Banana 2: received ${res.images.length} image(s)`);
          return res;
        },
      });

      setModelResult('nano', { status: 'success', images: result.images });
      addLog('Nano Banana 2 test PASSED', 'success');
    } catch (err) {
      setModelResult('nano', { status: 'error', error: err.message });
      addLog(`Nano Banana 2 test FAILED: ${err.message}`, 'error');
    } finally {
      setModelRunning('nano', false);
    }
  };

  // ── Test LLM Expansion ─────────────────────────────────────────────────
  const testLLM = async () => {
    setModelRunning('llm', true);
    setModelResult('llm', { status: 'running', variants: [] });
    addLog('Starting LLM prompt expansion test...');

    try {
      const llm = getLLMAdapter();
      const variants = await llm.expandPrompt(prompt, { model: 'qwen-image-3' });
      setModelResult('llm', { status: 'success', variants });
      addLog(`LLM test PASSED: ${variants.length} variant(s) generated`, 'success');
      variants.forEach((v, i) => addLog(`  Variant ${i + 1}: ${v.slice(0, 100)}...`));
    } catch (err) {
      setModelResult('llm', { status: 'error', error: err.message });
      addLog(`LLM test FAILED: ${err.message}`, 'error');
    } finally {
      setModelRunning('llm', false);
    }
  };

  const clearLogs = () => setLogs([]);

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '24px', marginBottom: '16px' }}>API Integration Test</h1>
      <p style={{ color: '#666', marginBottom: '24px' }}>
        Test each model adapter end-to-end. Results appear below each button.
        Logs show detailed request/response flow.
      </p>

      {/* Prompt input */}
      <div style={sectionStyle}>
        <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px' }}>Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          style={{
            width: '100%',
            padding: '8px',
            borderRadius: '6px',
            border: '1px solid #ccc',
            fontSize: '14px',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Test buttons */}
      <div style={sectionStyle}>
        <h3 style={{ marginTop: 0 }}>Model Tests</h3>
        <div>
          <button
            onClick={testQwen}
            disabled={running.qwen}
            style={running.qwen ? btnDisabledStyle : btnStyle('#6366f1')}
          >
            {running.qwen ? 'Running...' : 'Test Qwen Image 3'}
          </button>

          <button
            onClick={testGPT}
            disabled={running.gpt}
            style={running.gpt ? btnDisabledStyle : btnStyle('#10b981')}
          >
            {running.gpt ? 'Running...' : 'Test GPT-image-2'}
          </button>

          <button
            onClick={testNano}
            disabled={running.nano}
            style={running.nano ? btnDisabledStyle : btnStyle('#f59e0b')}
          >
            {running.nano ? 'Running...' : 'Test Nano Banana 2'}
          </button>

          <button
            onClick={testLLM}
            disabled={running.llm}
            style={running.llm ? btnDisabledStyle : btnStyle('#8b5cf6')}
          >
            {running.llm ? 'Running...' : 'Test LLM Expansion'}
          </button>
        </div>
      </div>

      {/* Results */}
      {Object.entries(results).map(([modelId, data]) => (
        <div key={modelId} style={sectionStyle}>
          <h4 style={{ marginTop: 0 }}>
            Result: {modelId}
            {data.status === 'success' && <span style={{ color: '#10b981', marginLeft: 8 }}>PASS</span>}
            {data.status === 'error' && <span style={{ color: '#ef4444', marginLeft: 8 }}>FAIL</span>}
            {data.status === 'running' && <span style={{ color: '#f59e0b', marginLeft: 8 }}>Running...</span>}
          </h4>

          {data.error && (
            <div style={{ color: '#ef4444', background: '#fef2f2', padding: '8px', borderRadius: '4px' }}>
              {data.error}
            </div>
          )}

          {data.images && data.images.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {data.images.map((img, i) => (
                <div key={i}>
                  <img src={img.url} alt={`Result ${i + 1}`} style={imgStyle} />
                  <div style={{ fontSize: '11px', color: '#888', marginTop: '4px', wordBreak: 'break-all' }}>
                    {img.url.slice(0, 80)}...
                  </div>
                </div>
              ))}
            </div>
          )}

          {data.variants && data.variants.length > 0 && (
            <div>
              {data.variants.map((v, i) => (
                <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid #eee', fontSize: '13px' }}>
                  <strong>Variant {i + 1}:</strong> {v}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Task status */}
      <div style={sectionStyle}>
        <h3 style={{ marginTop: 0 }}>Task Engine Status</h3>
        <div style={{ fontSize: '13px' }}>
          <div>Total tasks: {tasks.length}</div>
          <div>Active: {tasks.filter((t) => t.status === 'running').length}</div>
          <div>Queued: {tasks.filter((t) => t.status === 'queued').length}</div>
          <div>Completed: {tasks.filter((t) => t.status === 'completed').length}</div>
          <div>Failed: {tasks.filter((t) => t.status === 'failed').length}</div>
        </div>
        {tasks.length > 0 && (
          <div style={{ marginTop: '12px', maxHeight: '200px', overflow: 'auto' }}>
            <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #ddd' }}>
                  <th style={{ textAlign: 'left', padding: '4px' }}>ID</th>
                  <th style={{ textAlign: 'left', padding: '4px' }}>Model</th>
                  <th style={{ textAlign: 'left', padding: '4px' }}>Status</th>
                  <th style={{ textAlign: 'left', padding: '4px' }}>Progress</th>
                </tr>
              </thead>
              <tbody>
                {tasks.slice(0, 20).map((t) => (
                  <tr key={t.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '4px', fontFamily: 'monospace' }}>{String(t.id).slice(0, 8)}</td>
                    <td style={{ padding: '4px' }}>{t.model || '-'}</td>
                    <td style={{ padding: '4px' }}>{t.status}</td>
                    <td style={{ padding: '4px' }}>{t.progress ?? 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Logs */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ marginTop: 0 }}>Logs</h3>
          <button onClick={clearLogs} style={{ padding: '4px 12px', fontSize: '12px', cursor: 'pointer' }}>
            Clear
          </button>
        </div>
        <div
          ref={logRef}
          style={{
            maxHeight: '300px',
            overflow: 'auto',
            background: '#1e1e1e',
            color: '#d4d4d4',
            padding: '12px',
            borderRadius: '6px',
            fontFamily: 'monospace',
            fontSize: '12px',
          }}
        >
          {logs.length === 0 ? (
            <div style={{ color: '#888' }}>No logs yet. Click a test button above to start.</div>
          ) : (
            logs.map((log, i) => (
              <div
                key={i}
                style={{
                  ...logEntryStyle,
                  color: log.type === 'error' ? '#f87171' : log.type === 'success' ? '#4ade80' : '#d4d4d4',
                  borderBottom: '1px solid #333',
                }}
              >
                {log.msg}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
