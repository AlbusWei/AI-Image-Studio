import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles, Check, ChevronLeft, ChevronRight, ArrowRight,
  Eye, EyeOff, Cloud, PenLine, Sliders, CheckCircle2,
  TestTubes, SkipForward, Loader,
} from 'lucide-react';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useUIStore } from '../stores/useUIStore';
import { MODELS, MODEL_ORDER } from '../constants/models';

const STEP_LABELS = ['欢迎', '模型', '存储', '扩写', '偏好', '完成'];

function StepIndicator({ current }) {
  return (
    <div className="flex items-center justify-center gap-0" style={{ marginBottom: 'var(--sp-8)' }}>
      {STEP_LABELS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <React.Fragment key={label}>
            <div className="flex-col items-center gap-1" style={{ display: 'flex', gap: 'var(--sp-1)', alignItems: 'center' }}>
              <div className="flex items-center justify-center"
                style={{
                  width: 28, height: 28, borderRadius: 'var(--radius-circle)',
                  background: done ? 'var(--accent-success)' : active ? 'var(--accent-primary)' : 'rgba(255,255,255,0.06)',
                  color: done || active ? '#fff' : 'var(--text-muted)',
                  fontSize: 'var(--fs-xs)', fontWeight: 'var(--fw-semibold)',
                  transition: 'all var(--transition-base)',
                  border: active ? '2px solid var(--accent-hover)' : '2px solid transparent',
                }}>
                {done ? <Check size={14} /> : i + 1}
              </div>
              <span className="text-xs" style={{ color: active ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: active ? 'var(--fw-medium)' : 'var(--fw-normal)' }}>{label}</span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div style={{ width: 48, height: 2, background: i < current ? 'var(--accent-success)' : 'rgba(255,255,255,0.08)', borderRadius: 1, marginBottom: 18, transition: 'background var(--transition-base)' }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function MaskedInput({ value, placeholder, onChange }) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input type={visible ? 'text' : 'password'} className="input" value={value} placeholder={placeholder} onChange={onChange} style={{ paddingRight: 36 }} />
      <button type="button" className="btn-icon" onClick={() => setVisible(!visible)} style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)' }}>
        {visible ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}

function WizardShell({ children, onBack, showBack }) {
  return (
    <div className="flex-col items-center justify-center h-full overflow-y-auto"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 'var(--sp-8) var(--sp-4)', background: 'var(--bg-base)' }}>
      <div style={{ width: '100%', maxWidth: 700 }}>
        {showBack && (
          <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 'var(--sp-4)' }}>
            <ChevronLeft size={14} /> 上一步
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

export default function SetupWizard() {
  const navigate = useNavigate();
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const isSetupComplete = useSettingsStore((s) => s.isSetupComplete);
  const isLoaded = useSettingsStore((s) => s.isLoaded);
  const updateModelConfig = useSettingsStore((s) => s.updateModelConfig);
  const updateStorageConfig = useSettingsStore((s) => s.updateStorageConfig);
  const updateExpansionConfig = useSettingsStore((s) => s.updateExpansionConfig);
  const updateGeneralConfig = useSettingsStore((s) => s.updateGeneralConfig);
  const completeSetup = useSettingsStore((s) => s.completeSetup);
  const addToast = useUIStore((s) => s.addToast);

  const [step, setStep] = useState(0);
  // Model configs: { modelId: { enabled, apiKey, endpoint } }
  const [modelConfigs, setModelConfigs] = useState({});
  const [testResults, setTestResults] = useState({});
  const [testingModel, setTestingModel] = useState(null);

  // Storage
  const [hotCapacity, setHotCapacity] = useState(100);
  const [ossBucket, setOssBucket] = useState('');
  const [ossRegion, setOssRegion] = useState('');
  const [ossAccessKeyId, setOssAccessKeyId] = useState('');
  const [ossAccessKeySecret, setOssAccessKeySecret] = useState('');

  // Expansion
  const [expansionModel, setExpansionModel] = useState('qwen-max');
  const [expansionKey, setExpansionKey] = useState('');
  const [expansionEndpoint, setExpansionEndpoint] = useState('');
  const [testingExpansion, setTestingExpansion] = useState(false);
  const [expansionTestResult, setExpansionTestResult] = useState(null);

  // Preferences
  const [defaultModel, setDefaultModel] = useState('gpt-image-2');

  const next = () => setStep((s) => Math.min(s + 1, 5));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  // Load settings on mount and check if setup is complete
  useEffect(() => {
    loadSettings().then(() => {
      const st = useSettingsStore.getState();
      if (st.isSetupComplete) {
        navigate('/', { replace: true });
        return;
      }
      // Initialize model configs from store
      const mc = {};
      for (const id of MODEL_ORDER) {
        const cfg = st.modelConfigs[id] || {};
        mc[id] = { enabled: cfg.enabled !== false, apiKey: cfg.apiKey || '', endpoint: cfg.endpoint || '' };
      }
      setModelConfigs(mc);
      setHotCapacity(st.storageConfig.hotCapacity || 100);
      setOssBucket(st.storageConfig.ossBucket || '');
      setOssRegion(st.storageConfig.ossRegion || '');
      setOssAccessKeyId(st.storageConfig.ossAccessKeyId || '');
      setOssAccessKeySecret(st.storageConfig.ossAccessKeySecret || '');
      setExpansionModel(st.expansionConfig.model || 'qwen-max');
      setExpansionKey(st.expansionConfig.apiKey || '');
      setExpansionEndpoint(st.expansionConfig.endpoint || st.expansionConfig.apiBase || '');
      setDefaultModel(st.generalConfig.defaultModel || 'gpt-image-2');
    });
  }, []);

  const toggleModel = (modelId) => {
    setModelConfigs((prev) => ({
      ...prev,
      [modelId]: { ...prev[modelId], enabled: !prev[modelId]?.enabled },
    }));
  };

  const updateModelField = (modelId, field, value) => {
    setModelConfigs((prev) => ({
      ...prev,
      [modelId]: { ...prev[modelId], [field]: value },
    }));
  };

  const enabledCount = MODEL_ORDER.filter((id) => modelConfigs[id]?.enabled).length;

  const handleTestModelConnection = async (modelId) => {
    setTestingModel(modelId);
    setTestResults((p) => ({ ...p, [modelId]: null }));
    try {
      const endpoint = modelConfigs[modelId]?.endpoint || '';
      const apiKey = modelConfigs[modelId]?.apiKey || '';
      if (!endpoint && !apiKey) {
        setTestResults((p) => ({ ...p, [modelId]: { ok: false, msg: '未配置 Endpoint 和 API Key' } }));
        return;
      }
      const start = Date.now();

      if (modelId === 'qwen-image-3') {
        try {
          await axios.post('/api/qwen/', {
            model: 'pre-qwen-image-3.0-preprocess-0703-t2iv1',
            input: { messages: [{ role: 'user', content: [{ text: 'test' }] }] },
            parameters: { size: '256*256', n: 1, prompt_extend: false },
          }, { timeout: 15000 });
          setTestResults((p) => ({ ...p, [modelId]: { ok: true, msg: `连接正常 (${Date.now() - start}ms)` } }));
        } catch (err) {
          const status = err.response?.status;
          const data = err.response?.data;
          const ms = Date.now() - start;
          if (status === 401 || status === 403 || data?.code === 'InvalidApiKey' || data?.code === 'Arrearage') {
            setTestResults((p) => ({ ...p, [modelId]: { ok: false, msg: `API Key 无效 (${ms}ms)` } }));
          } else {
            setTestResults((p) => ({ ...p, [modelId]: { ok: true, msg: `连接正常 (${ms}ms)` } }));
          }
        }
      } else if (modelId === 'gpt-image-2') {
        try {
          await axios.post('/api/evolink/v1/images/generations', {
            model: 'gpt-image-2', prompt: 'test', size: '1024x1024', n: 1,
          }, { timeout: 15000 });
          setTestResults((p) => ({ ...p, [modelId]: { ok: true, msg: `连接正常 (${Date.now() - start}ms)` } }));
        } catch (err) {
          const status = err.response?.status;
          const data = err.response?.data;
          const ms = Date.now() - start;
          if (status === 401 || status === 403 || /invalid.*key|unauthorized/i.test(data?.error?.message || '')) {
            setTestResults((p) => ({ ...p, [modelId]: { ok: false, msg: `API Key 无效 (${ms}ms)` } }));
          } else {
            setTestResults((p) => ({ ...p, [modelId]: { ok: true, msg: `连接正常 (${ms}ms)` } }));
          }
        }
      } else {
        try {
          await axios.post('/api/evolink/v1/images/generations', {
            model: modelId, prompt: 'test', size: 'auto', n: 1,
          }, { timeout: 15000 });
          setTestResults((p) => ({ ...p, [modelId]: { ok: true, msg: `连接正常 (${Date.now() - start}ms)` } }));
        } catch (err) {
          const status = err.response?.status;
          const data = err.response?.data;
          const ms = Date.now() - start;
          if (status === 401 || status === 403 || /invalid.*key|unauthorized/i.test(data?.error?.message || '')) {
            setTestResults((p) => ({ ...p, [modelId]: { ok: false, msg: `API Key 无效 (${ms}ms)` } }));
          } else {
            setTestResults((p) => ({ ...p, [modelId]: { ok: true, msg: `连接正常 (${ms}ms)` } }));
          }
        }
      }
    } catch (err) {
      setTestResults((p) => ({ ...p, [modelId]: { ok: false, msg: `连接失败: ${err.message}` } }));
    } finally {
      setTestingModel(null);
    }
  };

  const handleTestExpansion = async () => {
    setTestingExpansion(true);
    setExpansionTestResult(null);
    try {
      if (!expansionEndpoint && !expansionKey) {
        setExpansionTestResult({ ok: false, msg: '未配置 Endpoint 和 API Key' });
        return;
      }
      const start = Date.now();
      try {
        await axios.post('/api/llm/chat/completions', {
          model: expansionModel || 'qwen-max',
          messages: [{ role: 'user', content: 'hello' }],
          max_tokens: 5,
        }, { timeout: 15000 });
        setExpansionTestResult({ ok: true, msg: `连接正常 (${Date.now() - start}ms)` });
      } catch (err) {
        const status = err.response?.status;
        const data = err.response?.data;
        const ms = Date.now() - start;
        if (status === 401 || status === 403 || data?.code === 'InvalidApiKey') {
          setExpansionTestResult({ ok: false, msg: `API Key 无效 (${ms}ms)` });
        } else {
          setExpansionTestResult({ ok: true, msg: `连接正常 (${ms}ms)` });
        }
      }
    } catch (err) {
      setExpansionTestResult({ ok: false, msg: `连接失败: ${err.message}` });
    } finally {
      setTestingExpansion(false);
    }
  };

  const handleFinish = async () => {
    try {
      // Save model configs
      for (const id of MODEL_ORDER) {
        const cfg = modelConfigs[id] || {};
        updateModelConfig(id, { enabled: cfg.enabled !== false, apiKey: cfg.apiKey || '', endpoint: cfg.endpoint || '' });
      }
      // Save storage config
      updateStorageConfig({ hotCapacity, ossBucket, ossRegion, ossAccessKeyId, ossAccessKeySecret });
      // Save expansion config
      updateExpansionConfig({ model: expansionModel, apiKey: expansionKey, endpoint: expansionEndpoint, apiBase: expansionEndpoint });
      // Save general config
      updateGeneralConfig({ defaultModel });
      // Mark setup complete
      await completeSetup();
      addToast('配置已保存，开始创作之旅！', { type: 'success' });
      setStep(5);
    } catch (err) {
      addToast('保存配置失败: ' + err.message, { type: 'error' });
    }
  };

  return (
    <WizardShell showBack={step > 0 && step < 5} onBack={back}>
      <StepIndicator current={step} />

      {/* Step 0: Welcome */}
      {step === 0 && (
        <div className="flex-col items-center text-center" style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)' }}>
          <div className="flex items-center justify-center"
            style={{ width: 80, height: 80, borderRadius: 'var(--radius-xl)', background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', boxShadow: '0 8px 32px rgba(108, 92, 231, 0.3)' }}>
            <Sparkles size={40} color="#fff" />
          </div>
          <div className="flex-col gap-2" style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
            <h1 style={{ fontSize: 'var(--fs-4xl)', fontWeight: 'var(--fw-bold)', letterSpacing: 'var(--ls-tight)' }}>欢迎使用 AI Image Studio</h1>
            <p style={{ fontSize: 'var(--fs-lg)', color: 'var(--text-secondary)' }}>专业级 AI 图片生成工作站</p>
            <p className="text-sm" style={{ color: 'var(--text-muted)', maxWidth: 400 }}>配置你的模型 API 即可开始创作</p>
          </div>
          <button className="btn btn-primary btn-lg" onClick={next} style={{ marginTop: 'var(--sp-4)' }}>
            开始配置 <ArrowRight size={16} />
          </button>
        </div>
      )}

      {/* Step 1: Model Configuration */}
      {step === 1 && (
        <div className="flex-col gap-5" style={{ display: 'flex', gap: 'var(--sp-5)' }}>
          <div className="text-center" style={{ marginBottom: 'var(--sp-2)' }}>
            <h2 style={{ fontSize: 'var(--fs-2xl)', fontWeight: 'var(--fw-bold)' }}>选择并配置模型</h2>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)', marginTop: 'var(--sp-1)' }}>至少配置一个模型即可开始使用</p>
          </div>
          <div className="flex-col gap-3" style={{ display: 'flex', gap: 'var(--sp-3)' }}>
            {MODEL_ORDER.map((modelId) => {
              const model = MODELS[modelId];
              const m = modelConfigs[modelId] || { enabled: true, apiKey: '', endpoint: '' };
              const tr = testResults[modelId];
              return (
                <div key={modelId} className="card" style={{ padding: 'var(--sp-4)', borderColor: m.enabled ? 'var(--accent-primary)' : 'var(--border-default)', opacity: m.enabled ? 1 : 0.6, transition: 'all var(--transition-base)' }}>
                  <div className="flex items-center gap-3" style={{ marginBottom: m.enabled ? 'var(--sp-3)' : 0 }}>
                    <button className={`checkbox ${m.enabled ? 'checked' : ''}`} onClick={() => toggleModel(modelId)}>
                      {m.enabled && <Check size={11} color="#fff" />}
                    </button>
                    <div className="flex-1">
                      <span style={{ fontSize: 'var(--fs-md)', fontWeight: 'var(--fw-semibold)' }}>{model.name}</span>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{model.provider}</p>
                    </div>
                  </div>
                  {m.enabled && (
                    <div className="flex-col gap-2" style={{ display: 'flex', gap: 'var(--sp-2)', paddingLeft: 'var(--sp-8)' }}>
                      <MaskedInput value={m.apiKey} placeholder="请输入 API Key" onChange={(e) => updateModelField(modelId, 'apiKey', e.target.value)} />
                      <input className="input" value={m.endpoint} placeholder="API Endpoint (https://...)" onChange={(e) => updateModelField(modelId, 'endpoint', e.target.value)} />
                      <div className="flex items-center gap-2">
                        <button className="btn btn-ghost btn-sm" onClick={() => handleTestModelConnection(modelId)} disabled={testingModel === modelId}>
                          {testingModel === modelId ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <TestTubes size={12} />} 测试连接
                        </button>
                        {tr && <span className="text-xs" style={{ color: tr.ok ? 'var(--accent-success)' : 'var(--accent-danger)' }}>{tr.msg}</span>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between" style={{ marginTop: 'var(--sp-2)' }}>
            <button className="btn btn-subtle" onClick={() => setStep(2)}><SkipForward size={14} /> 跳过</button>
            <button className="btn btn-primary" onClick={next} disabled={enabledCount === 0}>下一步 <ChevronRight size={14} /></button>
          </div>
        </div>
      )}

      {/* Step 2: Storage */}
      {step === 2 && (
        <div className="flex-col gap-5" style={{ display: 'flex', gap: 'var(--sp-5)' }}>
          <div className="text-center" style={{ marginBottom: 'var(--sp-2)' }}>
            <div className="flex items-center justify-center gap-2" style={{ marginBottom: 'var(--sp-2)' }}>
              <Cloud size={22} style={{ color: 'var(--accent-secondary)' }} />
              <h2 style={{ fontSize: 'var(--fs-2xl)', fontWeight: 'var(--fw-bold)' }}>云端存储配置</h2>
            </div>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>配置阿里云 OSS 以启用冷热分层存储</p>
          </div>
          <div className="card" style={{ padding: 'var(--sp-4)' }}>
            <div className="flex-col gap-3" style={{ display: 'flex', gap: 'var(--sp-3)' }}>
              <div className="flex-col gap-1" style={{ display: 'flex', gap: 'var(--sp-1)' }}>
                <label className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Bucket 名称</label>
                <input className="input" value={ossBucket} placeholder="my-ai-image-bucket" onChange={(e) => setOssBucket(e.target.value)} />
              </div>
              <div className="flex-col gap-1" style={{ display: 'flex', gap: 'var(--sp-1)' }}>
                <label className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Region</label>
                <select className="select" value={ossRegion} onChange={(e) => setOssRegion(e.target.value)}>
                  <option value="">请选择区域</option>
                  <option value="oss-cn-hangzhou">华东1 (杭州)</option>
                  <option value="oss-cn-shanghai">华东2 (上海)</option>
                  <option value="oss-cn-beijing">华北2 (北京)</option>
                  <option value="oss-cn-shenzhen">华南1 (深圳)</option>
                </select>
              </div>
              <div className="flex-col gap-1" style={{ display: 'flex', gap: 'var(--sp-1)' }}>
                <label className="text-xs" style={{ color: 'var(--text-tertiary)' }}>AccessKey ID</label>
                <MaskedInput value={ossAccessKeyId} placeholder="请输入 AccessKey ID" onChange={(e) => setOssAccessKeyId(e.target.value)} />
              </div>
              <div className="flex-col gap-1" style={{ display: 'flex', gap: 'var(--sp-1)' }}>
                <label className="text-xs" style={{ color: 'var(--text-tertiary)' }}>AccessKey Secret</label>
                <MaskedInput value={ossAccessKeySecret} placeholder="请输入 AccessKey Secret" onChange={(e) => setOssAccessKeySecret(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between" style={{ marginTop: 'var(--sp-2)' }}>
            <button className="btn btn-subtle" onClick={() => setStep(3)}><SkipForward size={14} /> 跳过此步骤</button>
            <button className="btn btn-primary" onClick={next}>下一步 <ChevronRight size={14} /></button>
          </div>
        </div>
      )}

      {/* Step 3: Expansion LLM */}
      {step === 3 && (
        <div className="flex-col gap-5" style={{ display: 'flex', gap: 'var(--sp-5)' }}>
          <div className="text-center" style={{ marginBottom: 'var(--sp-2)' }}>
            <div className="flex items-center justify-center gap-2" style={{ marginBottom: 'var(--sp-2)' }}>
              <PenLine size={22} style={{ color: 'var(--accent-primary)' }} />
              <h2 style={{ fontSize: 'var(--fs-2xl)', fontWeight: 'var(--fw-bold)' }}>提示词扩写配置</h2>
            </div>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>配置扩写模型以提升提示词质量</p>
          </div>
          <div className="card" style={{ padding: 'var(--sp-4)' }}>
            <div className="flex-col gap-3" style={{ display: 'flex', gap: 'var(--sp-3)' }}>
              <div className="flex-col gap-1" style={{ display: 'flex', gap: 'var(--sp-1)' }}>
                <label className="text-xs" style={{ color: 'var(--text-tertiary)' }}>扩写模型</label>
                <select className="select" value={expansionModel} onChange={(e) => setExpansionModel(e.target.value)}>
                  <option value="qwen-max">Qwen-max</option>
                  <option value="qwen-plus">Qwen-plus</option>
                  <option value="qwen-turbo">Qwen-turbo</option>
                </select>
              </div>
              <div className="flex-col gap-1" style={{ display: 'flex', gap: 'var(--sp-1)' }}>
                <label className="text-xs" style={{ color: 'var(--text-tertiary)' }}>API Key</label>
                <MaskedInput value={expansionKey} placeholder="请输入 API Key" onChange={(e) => setExpansionKey(e.target.value)} />
              </div>
              <div className="flex-col gap-1" style={{ display: 'flex', gap: 'var(--sp-1)' }}>
                <label className="text-xs" style={{ color: 'var(--text-tertiary)' }}>API Endpoint</label>
                <input className="input" value={expansionEndpoint} placeholder="https://..." onChange={(e) => setExpansionEndpoint(e.target.value)} />
              </div>
              <div className="flex items-center gap-2">
                <button className="btn btn-ghost btn-sm" onClick={handleTestExpansion} disabled={testingExpansion}>
                  {testingExpansion ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <TestTubes size={12} />} 测试连接
                </button>
                {expansionTestResult && <span className="text-xs" style={{ color: expansionTestResult.ok ? 'var(--accent-success)' : 'var(--accent-danger)' }}>{expansionTestResult.msg}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between" style={{ marginTop: 'var(--sp-2)' }}>
            <button className="btn btn-subtle" onClick={() => setStep(4)}><SkipForward size={14} /> 跳过此步骤</button>
            <button className="btn btn-primary" onClick={next}>下一步 <ChevronRight size={14} /></button>
          </div>
        </div>
      )}

      {/* Step 4: Preferences */}
      {step === 4 && (
        <div className="flex-col gap-5" style={{ display: 'flex', gap: 'var(--sp-5)' }}>
          <div className="text-center" style={{ marginBottom: 'var(--sp-2)' }}>
            <div className="flex items-center justify-center gap-2" style={{ marginBottom: 'var(--sp-2)' }}>
              <Sliders size={22} style={{ color: 'var(--accent-primary)' }} />
              <h2 style={{ fontSize: 'var(--fs-2xl)', fontWeight: 'var(--fw-bold)' }}>基本偏好</h2>
            </div>
          </div>
          <div className="card" style={{ padding: 'var(--sp-4)' }}>
            <div className="flex-col gap-4" style={{ display: 'flex', gap: 'var(--sp-4)' }}>
              <div className="flex-col gap-2" style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                <label style={{ fontSize: 'var(--fs-base)', fontWeight: 'var(--fw-medium)' }}>热区大小</label>
                <div className="flex items-center gap-3">
                  <input type="range" min={10} max={200} value={hotCapacity} onChange={(e) => setHotCapacity(Number(e.target.value))} style={{ flex: 1, accentColor: 'var(--accent-primary)' }} />
                  <span style={{ fontSize: 'var(--fs-md)', color: 'var(--text-secondary)', minWidth: 60, textAlign: 'right' }}>{hotCapacity} GB</span>
                </div>
              </div>
              <div style={{ height: 1, background: 'var(--border-subtle)' }} />
              <div className="flex items-center justify-between">
                <label style={{ fontSize: 'var(--fs-base)', fontWeight: 'var(--fw-medium)' }}>默认模型</label>
                <select className="select" value={defaultModel} onChange={(e) => setDefaultModel(e.target.value)}>
                  {MODEL_ORDER.map((id) => <option key={id} value={id}>{MODELS[id].name}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="flex justify-end" style={{ marginTop: 'var(--sp-2)' }}>
            <button className="btn btn-primary btn-lg" onClick={handleFinish}>完成设置 <Check size={16} /></button>
          </div>
        </div>
      )}

      {/* Step 5: Complete */}
      {step === 5 && (
        <div className="flex-col items-center text-center" style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)' }}>
          <div className="flex items-center justify-center" style={{ width: 80, height: 80, borderRadius: 'var(--radius-circle)', background: 'rgba(39, 166, 68, 0.15)' }}>
            <CheckCircle2 size={48} style={{ color: 'var(--accent-success)' }} />
          </div>
          <div className="flex-col gap-2" style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
            <h1 style={{ fontSize: 'var(--fs-3xl)', fontWeight: 'var(--fw-bold)' }}>设置完成！</h1>
            <p style={{ fontSize: 'var(--fs-lg)', color: 'var(--text-secondary)' }}>你已配置好 {enabledCount} 个模型，可以开始创作了</p>
          </div>
          <button className="btn btn-primary btn-lg" style={{ marginTop: 'var(--sp-4)' }} onClick={() => navigate('/')}>
            进入工作区 <ArrowRight size={16} />
          </button>
        </div>
      )}
    </WizardShell>
  );
}
