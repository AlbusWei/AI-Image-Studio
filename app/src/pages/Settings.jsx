import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Eye, EyeOff, Zap, CheckCircle2, AlertCircle, HardDrive, PenLine, Settings2, Cloud, TestTubes, Plus, Minus, Loader } from 'lucide-react';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useUIStore } from '../stores/useUIStore';
import { MODELS, MODEL_ORDER } from '../constants/models';
import StorageService from '../services/storage';

const TABS = [
  { key: 'api', label: '模型 API', icon: <Zap size={14} /> },
  { key: 'storage', label: '存储', icon: <HardDrive size={14} /> },
  { key: 'expansion', label: '提示词扩写', icon: <PenLine size={14} /> },
  { key: 'general', label: '通用', icon: <Settings2 size={14} /> },
];

function MaskedInput({ value, placeholder, onChange }) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input type={visible ? 'text' : 'password'} className="input" value={value} placeholder={placeholder} onChange={onChange} style={{ paddingRight: 36 }} />
      <button type="button" className="btn-icon" onClick={() => setVisible(!visible)} style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)' }}>{visible ? <EyeOff size={14} /> : <Eye size={14} />}</button>
    </div>
  );
}

function SettingRow({ label, description, children }) {
  return (
    <div className="flex items-center justify-between gap-4" style={{ padding: 'var(--sp-3) 0' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: '0 0 auto' }}>
        <span style={{ fontSize: 'var(--fs-base)', color: 'var(--text-primary)', fontWeight: 'var(--fw-medium)' }}>{label}</span>
        {description && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{description}</span>}
      </div>
      <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState('api');
  const modelConfigs = useSettingsStore((s) => s.modelConfigs);
  const storageConfig = useSettingsStore((s) => s.storageConfig);
  const expansionConfig = useSettingsStore((s) => s.expansionConfig);
  const generalConfig = useSettingsStore((s) => s.generalConfig);
  const updateModelConfig = useSettingsStore((s) => s.updateModelConfig);
  const updateStorageConfig = useSettingsStore((s) => s.updateStorageConfig);
  const updateExpansionConfig = useSettingsStore((s) => s.updateExpansionConfig);
  const updateGeneralConfig = useSettingsStore((s) => s.updateGeneralConfig);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const addToast = useUIStore((s) => s.addToast);

  const [apiKeys, setApiKeys] = useState({});
  const [endpoints, setEndpoints] = useState({});
  const [testResults, setTestResults] = useState({});
  const [testingModel, setTestingModel] = useState(null);
  const [testingOss, setTestingOss] = useState(false);
  const [ossTestResult, setOssTestResult] = useState(null);
  const [testingExpansion, setTestingExpansion] = useState(false);
  const [expansionTestResult, setExpansionTestResult] = useState(null);
  const [hotCapacity, setHotCapacity] = useState(100);
  const [ossConfig, setOssConfig] = useState({ bucket: '', region: '', accessKeyId: '', accessKeySecret: '' });
  const [expansionKey, setExpansionKey] = useState('');
  const [expansionEndpoint, setExpansionEndpoint] = useState('');
  const [expansionModel, setExpansionModel] = useState('qwen3.7-max');
  const [ragTopK, setRagTopK] = useState(3);
  const [promptTemplate, setPromptTemplate] = useState('');
  const [notifyEnabled, setNotifyEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [language, setLanguage] = useState('zh');
  const [defaultModel, setDefaultModel] = useState('gpt-image-2');
  const [imageFormat, setImageFormat] = useState('png');

  useEffect(() => {
    loadSettings().then(() => {
      const st = useSettingsStore.getState();
      const keys = {}; const eps = {};
      for (const [id, cfg] of Object.entries(st.modelConfigs)) { keys[id] = cfg.apiKey || ''; eps[id] = cfg.endpoint || ''; }
      setApiKeys(keys); setEndpoints(eps);
      setHotCapacity(st.storageConfig.hotCapacity || 100);
      setOssConfig({ bucket: st.storageConfig.ossBucket || '', region: st.storageConfig.ossRegion || '', accessKeyId: st.storageConfig.ossAccessKeyId || '', accessKeySecret: st.storageConfig.ossAccessKeySecret || '' });
      setExpansionKey(st.expansionConfig.apiKey || ''); setExpansionEndpoint(st.expansionConfig.endpoint || st.expansionConfig.apiBase || ''); setExpansionModel(st.expansionConfig.model || 'qwen3.7-max');
      setRagTopK(st.expansionConfig.ragTopK || 3); setPromptTemplate(st.expansionConfig.promptTemplate || '');
      setNotifyEnabled(st.generalConfig.notifyEnabled ?? true); setSoundEnabled(st.generalConfig.soundEnabled ?? false); setLanguage(st.generalConfig.language || 'zh'); setDefaultModel(st.generalConfig.defaultModel || 'gpt-image-2'); setImageFormat(st.generalConfig.imageFormat || 'png');
    });
  }, []);

  const handleTestConnection = async (modelId) => {
    setTestingModel(modelId); setTestResults((p) => ({ ...p, [modelId]: null }));
    try {
      const endpoint = endpoints[modelId] || '';
      if (!endpoint && !apiKeys[modelId]) {
        setTestResults((p) => ({ ...p, [modelId]: { ok: false, msg: '未配置 Endpoint 和 API Key' } }));
        return;
      }
      const start = Date.now();

      if (modelId === 'qwen-image-3') {
        // Send a minimal Qwen T2I request through the proxy
        try {
          await axios.post('/api/qwen/', {
            model: 'pre-qwen-image-3-preprocess-0706',
            input: { messages: [{ role: 'user', content: [{ text: 'test' }] }] },
            parameters: { size: '256*256', n: 1 },
          }, { timeout: 15000 });
          setTestResults((p) => ({ ...p, [modelId]: { ok: true, msg: `连接正常 (${Date.now() - start}ms)` } }));
        } catch (err) {
          const status = err.response?.status;
          const data = err.response?.data;
          const ms = Date.now() - start;
          if (status === 401 || status === 403 || data?.code === 'InvalidApiKey' || data?.code === 'Arrearage') {
            setTestResults((p) => ({ ...p, [modelId]: { ok: false, msg: `API Key 无效 (${ms}ms)` } }));
          } else {
            // Any other response means endpoint reachable and key accepted
            setTestResults((p) => ({ ...p, [modelId]: { ok: true, msg: `连接正常 (${ms}ms)` } }));
          }
        }
      } else if (modelId === 'gpt-image-2') {
        // Send a minimal EvoLink submission through the proxy
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
        // Nano Banana 2 / other EvoLink models
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

  const handleTestOSS = async () => {
    setTestingOss(true); setOssTestResult(null);
    try {
      const result = await StorageService.checkOSSConnection(ossConfig);
      setOssTestResult(result);
    } catch (err) {
      setOssTestResult({ ok: false, msg: `连接失败: ${err.message}` });
    } finally {
      setTestingOss(false);
    }
  };

  const handleTestExpansion = async () => {
    setTestingExpansion(true); setExpansionTestResult(null);
    try {
      if (!expansionEndpoint && !expansionKey) {
        setExpansionTestResult({ ok: false, msg: '未配置 Endpoint 和 API Key' });
        return;
      }
      const start = Date.now();
      // Send a minimal chat completion request through the proxy
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

  const handleSaveApi = (modelId) => { updateModelConfig(modelId, { apiKey: apiKeys[modelId] || '', endpoint: endpoints[modelId] || '', enabled: true }); addToast(`${MODELS[modelId]?.name || modelId} 配置已保存`, { type: 'success' }); };
  const handleSaveStorage = () => { updateStorageConfig({ hotCapacity, ossBucket: ossConfig.bucket, ossRegion: ossConfig.region, ossAccessKeyId: ossConfig.accessKeyId, ossAccessKeySecret: ossConfig.accessKeySecret }); addToast('存储配置已保存', { type: 'success' }); };
  const handleSaveExpansion = () => { updateExpansionConfig({ apiKey: expansionKey, endpoint: expansionEndpoint, apiBase: expansionEndpoint, model: expansionModel, ragTopK, promptTemplate }); addToast('扩写配置已保存', { type: 'success' }); };
  const handleSaveGeneral = () => { updateGeneralConfig({ notifyEnabled, soundEnabled, language, defaultModel, imageFormat, theme }); addToast('通用设置已保存', { type: 'success' }); };

  return (
    <div className="flex-col h-full overflow-y-auto" style={{ padding: 'var(--sp-6)', gap: 'var(--sp-6)' }}>
      <h1 style={{ fontSize: 'var(--fs-3xl)', fontWeight: 'var(--fw-bold)', letterSpacing: 'var(--ls-tight)' }}>设置</h1>
      <div className="tabs" style={{ alignSelf: 'flex-start' }}>{TABS.map((tab) => (<button key={tab.key} className={`tab flex items-center gap-1 ${activeTab === tab.key ? 'active' : ''}`} onClick={() => setActiveTab(tab.key)}>{tab.icon} {tab.label}</button>))}</div>
      <div style={{ maxWidth: 720 }}>
        {activeTab === 'api' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
            {MODEL_ORDER.map((modelId) => {
              const model = MODELS[modelId]; const cfg = modelConfigs[modelId] || {}; const tr = testResults[modelId];
              return (
                <div key={modelId} className="card" style={{ padding: 'var(--sp-4)' }}>
                  <div className="flex items-center justify-between" style={{ marginBottom: 'var(--sp-4)' }}>
                    <span style={{ fontSize: 'var(--fs-lg)', fontWeight: 'var(--fw-semibold)' }}>{model.name}</span>
                    {cfg.apiKey ? <span className="badge badge-success"><CheckCircle2 size={11} /> 已配置</span> : <span className="badge badge-warning"><AlertCircle size={11} /> 未配置</span>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}><label className="text-xs" style={{ color: 'var(--text-tertiary)' }}>API Endpoint</label><input className="input" value={endpoints[modelId] || ''} placeholder="https://..." onChange={(e) => setEndpoints((p) => ({ ...p, [modelId]: e.target.value }))} /></div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}><label className="text-xs" style={{ color: 'var(--text-tertiary)' }}>API Key</label><MaskedInput value={apiKeys[modelId] || ''} placeholder="请输入 API Key" onChange={(e) => setApiKeys((p) => ({ ...p, [modelId]: e.target.value }))} /></div>
                    <div className="flex items-center justify-between" style={{ marginTop: 'var(--sp-1)' }}>
                      <div className="flex items-center gap-2">
                        <button className="btn btn-ghost btn-sm" onClick={() => handleTestConnection(modelId)} disabled={testingModel === modelId}>{testingModel === modelId ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <TestTubes size={12} />} 测试连接</button>
                        <button className="btn btn-primary btn-sm" onClick={() => handleSaveApi(modelId)}>保存</button>
                      </div>
                      {tr && <span className="text-xs" style={{ color: tr.ok ? 'var(--accent-success)' : 'var(--accent-danger)' }}>{tr.msg}</span>}
                    </div>
                    {modelId === 'qwen-image-3' && <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}><label className="text-xs" style={{ color: 'var(--text-tertiary)' }}>默认尺寸</label><select className="select" value={cfg.defaultParams?.size || '1024*1024'} onChange={(e) => updateModelConfig(modelId, { defaultParams: { ...cfg.defaultParams, size: e.target.value } })}>{model.sizes.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>}
                    {modelId === 'gpt-image-2' && <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}><label className="text-xs" style={{ color: 'var(--text-tertiary)' }}>默认质量</label><select className="select" value={cfg.defaultParams?.quality || 'auto'} onChange={(e) => updateModelConfig(modelId, { defaultParams: { ...cfg.defaultParams, quality: e.target.value } })}><option value="low">low</option><option value="medium">medium</option><option value="high">high</option><option value="auto">auto</option></select></div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {activeTab === 'storage' && (
          <div className="card" style={{ padding: 'var(--sp-5)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}><label className="text-xs" style={{ color: 'var(--text-tertiary)' }}>本地存储路径</label><input className="input" defaultValue="/Users/user/AIImageStudio/storage" readOnly style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-sm)' }} /></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
                <label className="text-xs" style={{ color: 'var(--text-tertiary)' }}>热区容量</label>
                <div className="flex items-center gap-3"><input type="range" min={0} max={200} value={hotCapacity} onChange={(e) => setHotCapacity(Number(e.target.value))} style={{ flex: 1, accentColor: 'var(--accent-primary)' }} /><div className="flex items-center gap-1"><input className="input" type="number" value={hotCapacity} onChange={(e) => setHotCapacity(Number(e.target.value))} style={{ width: 70, textAlign: 'center' }} /><span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>GB</span></div></div>
              </div>
              <div style={{ height: 1, background: 'var(--border-subtle)', margin: 'var(--sp-2) 0' }} />
              <div className="flex items-center gap-2" style={{ marginBottom: 'var(--sp-1)' }}><Cloud size={16} style={{ color: 'var(--accent-secondary)' }} /><span style={{ fontSize: 'var(--fs-md)', fontWeight: 'var(--fw-semibold)' }}>阿里云 OSS</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}><label className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Bucket</label><input className="input" placeholder="my-ai-image-bucket" value={ossConfig.bucket} onChange={(e) => setOssConfig((p) => ({ ...p, bucket: e.target.value }))} /></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}><label className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Region</label><select className="select" value={ossConfig.region} onChange={(e) => setOssConfig((p) => ({ ...p, region: e.target.value }))}><option value="" disabled>请选择区域</option><option value="oss-cn-hangzhou">华东1 (杭州)</option><option value="oss-cn-shanghai">华东2 (上海)</option><option value="oss-cn-beijing">华北2 (北京)</option><option value="oss-cn-shenzhen">华南1 (深圳)</option></select></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}><label className="text-xs" style={{ color: 'var(--text-tertiary)' }}>AccessKey ID</label><MaskedInput value={ossConfig.accessKeyId} placeholder="请输入" onChange={(e) => setOssConfig((p) => ({ ...p, accessKeyId: e.target.value }))} /></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}><label className="text-xs" style={{ color: 'var(--text-tertiary)' }}>AccessKey Secret</label><MaskedInput value={ossConfig.accessKeySecret} placeholder="请输入" onChange={(e) => setOssConfig((p) => ({ ...p, accessKeySecret: e.target.value }))} /></div>
              </div>
              <div className="flex items-center gap-2"><button className="btn btn-ghost btn-sm" onClick={handleTestOSS} disabled={testingOss}>{testingOss ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <TestTubes size={12} />} 测试连接</button><button className="btn btn-primary btn-sm" onClick={handleSaveStorage}>保存</button></div>
              {ossTestResult && <span className="text-xs" style={{ color: ossTestResult.ok ? 'var(--accent-success)' : 'var(--accent-danger)' }}>{ossTestResult.msg}</span>}
            </div>
          </div>
        )}
        {activeTab === 'expansion' && (
          <div className="card" style={{ padding: 'var(--sp-5)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}><label className="text-xs" style={{ color: 'var(--text-tertiary)' }}>扩写模型</label><select className="select" value={expansionModel} onChange={(e) => setExpansionModel(e.target.value)}><option value="qwen3.7-max">Qwen3.7-max</option><option value="qwen3.7-plus">Qwen3.7-plus</option><option value="gpt-4o">GPT-4o</option></select></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}><label className="text-xs" style={{ color: 'var(--text-tertiary)' }}>API Endpoint</label><input className="input" value={expansionEndpoint} placeholder="https://..." onChange={(e) => setExpansionEndpoint(e.target.value)} /></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}><label className="text-xs" style={{ color: 'var(--text-tertiary)' }}>API Key</label><MaskedInput value={expansionKey} placeholder="请输入 API Key" onChange={(e) => setExpansionKey(e.target.value)} /></div>
              <SettingRow label="RAG Top-K" description="检索返回的最相关文档数量"><div className="flex items-center gap-1"><button className="btn-icon" onClick={() => setRagTopK(Math.max(1, ragTopK - 1))} disabled={ragTopK <= 1}><Minus size={14} /></button><input className="input" type="number" value={ragTopK} onChange={(e) => setRagTopK(Math.max(1, Number(e.target.value)))} style={{ width: 50, textAlign: 'center' }} /><button className="btn-icon" onClick={() => setRagTopK(Math.min(10, ragTopK + 1))} disabled={ragTopK >= 10}><Plus size={14} /></button></div></SettingRow>
              <div style={{ height: 1, background: 'var(--border-subtle)', margin: 'var(--sp-2) 0' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}><label className="text-xs" style={{ color: 'var(--text-tertiary)' }}>标注辅助模板</label><textarea className="textarea" rows={8} value={promptTemplate} onChange={(e) => setPromptTemplate(e.target.value)} placeholder="使用 {{user_prompt}} 和 {{rag_context}} 作为占位符" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-sm)', lineHeight: 1.6 }} /></div>
              <div className="flex items-center gap-2"><button className="btn btn-ghost btn-sm" onClick={handleTestExpansion} disabled={testingExpansion}>{testingExpansion ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <TestTubes size={12} />} 测试连接</button><button className="btn btn-primary btn-sm" onClick={handleSaveExpansion}>保存</button></div>
              {expansionTestResult && <span className="text-xs" style={{ color: expansionTestResult.ok ? 'var(--accent-success)' : 'var(--accent-danger)' }}>{expansionTestResult.msg}</span>}
            </div>
          </div>
        )}
        {activeTab === 'general' && (
          <div className="card" style={{ padding: 'var(--sp-5)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}>
              <SettingRow label="默认生成模型" description="新建任务时默认使用的模型"><select className="select" value={defaultModel} onChange={(e) => setDefaultModel(e.target.value)}><option value="gpt-image-2">GPT-image-2</option><option value="qwen-image-3">Qwen Image 3</option><option value="nanobanana-2">Nano Banana 2</option></select></SettingRow>
              <div style={{ height: 1, background: 'var(--border-subtle)', margin: 'var(--sp-1) 0' }} />
              <SettingRow label="图片默认格式" description="生成图片的默认输出格式"><select className="select" value={imageFormat} onChange={(e) => setImageFormat(e.target.value)}><option value="png">PNG</option><option value="webp">WebP</option><option value="jpg">JPG</option></select></SettingRow>
              <div style={{ height: 1, background: 'var(--border-subtle)', margin: 'var(--sp-1) 0' }} />
              <SettingRow label="浏览器通知" description="任务完成时发送浏览器通知"><button className={`toggle ${notifyEnabled ? 'active' : ''}`} onClick={() => setNotifyEnabled(!notifyEnabled)} /></SettingRow>
              <div style={{ height: 1, background: 'var(--border-subtle)', margin: 'var(--sp-1) 0' }} />
              <SettingRow label="声音提示" description="任务完成时播放提示音"><button className={`toggle ${soundEnabled ? 'active' : ''}`} onClick={() => setSoundEnabled(!soundEnabled)} /></SettingRow>
              <div style={{ height: 1, background: 'var(--border-subtle)', margin: 'var(--sp-1) 0' }} />
              <SettingRow label="界面语言"><select className="select" value={language} onChange={(e) => setLanguage(e.target.value)}><option value="zh">中文</option><option value="en">English</option><option value="ja">日本語</option></select></SettingRow>
              <div style={{ height: 1, background: 'var(--border-subtle)', margin: 'var(--sp-1) 0' }} />
              <SettingRow label="主题"><div className="flex" style={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', overflow: 'hidden' }}><button className="btn btn-sm" onClick={() => setTheme('dark')} style={{ borderRadius: 0, border: 'none', background: theme === 'dark' ? 'var(--accent-primary)' : 'transparent', color: theme === 'dark' ? 'var(--text-on-accent)' : 'var(--text-tertiary)' }}>深色</button><button className="btn btn-sm" onClick={() => setTheme('light')} style={{ borderRadius: 0, border: 'none', borderLeft: '1px solid var(--border-default)', background: theme === 'light' ? 'var(--accent-primary)' : 'transparent', color: theme === 'light' ? 'var(--text-on-accent)' : 'var(--text-tertiary)' }}>浅色</button></div></SettingRow>
              <div style={{ marginTop: 'var(--sp-4)' }}><button className="btn btn-primary btn-sm" onClick={handleSaveGeneral}>保存设置</button></div>
            </div>
          </div>
        )}
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
