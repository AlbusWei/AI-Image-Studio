import React, { useState, useEffect, lazy, Suspense } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { HotkeysProvider } from 'react-hotkeys-hook';
import { Layers, X, CheckCircle, Eye } from 'lucide-react';
import Sidebar from './components/Sidebar';
import TaskPanel from './components/TaskPanel';
import Lightbox from './components/Lightbox';
import ShortcutOverlay from './components/ShortcutOverlay';
import MaskEditor from './components/MaskEditor';
import { IconButton } from './components/ui/Button';
import { useTaskStore } from './stores/useTaskStore';
import { useUIStore } from './stores/useUIStore';
import { useGenerationStore } from './stores/useGenerationStore';
import { useGalleryStore } from './stores/useGalleryStore';
import { useGlobalShortcuts, useShortcutScopes } from './hooks/useShortcuts';
import { requestPermission as requestNotificationPermission } from './services/notification';

const Workbench = lazy(() => import('./pages/Workbench'));
const Gallery = lazy(() => import('./pages/Gallery'));
const KnowledgeBase = lazy(() => import('./pages/KnowledgeBase'));
const TaskCenter = lazy(() => import('./pages/TaskCenter'));
const Settings = lazy(() => import('./pages/Settings'));
const SetupWizard = lazy(() => import('./pages/SetupWizard'));
const ApiTest = lazy(() => import('./pages/ApiTest'));

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', color: '#fff', background: '#1a1a2e', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
          <h2 style={{ color: '#e94560', marginBottom: '1rem' }}>出错了</h2>
          <p style={{ color: '#ccc', marginBottom: '1.5rem' }}>{this.state.error?.message}</p>
          <button
            onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
            style={{
              background: '#0f3460',
              color: '#fff',
              border: '1px solid #e94560',
              padding: '8px 20px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            重新加载
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function LoadingSkeleton() {
  return (
    <div data-component="Loading Skeleton" style={{ padding: 'var(--sp-8)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)', height: '100%' }}>
      <div className="skeleton" style={{ width: '40%', height: '28px' }} />
      <div className="skeleton" style={{ width: '60%', height: '16px' }} />
      <div style={{ display: 'flex', gap: 'var(--sp-4)', marginTop: 'var(--sp-4)' }}>
        <div className="skeleton" style={{ flex: 1, height: '200px' }} />
        <div className="skeleton" style={{ flex: 1, height: '200px' }} />
        <div className="skeleton" style={{ flex: 1, height: '200px' }} />
      </div>
      <div className="skeleton" style={{ width: '100%', height: '300px', marginTop: 'var(--sp-4)' }} />
    </div>
  );
}

function Toast({ visible, onClose }) {
  if (!visible) return null;

  return (
    <div className="toast-container" data-component="Toast Notification">
      <div className="toast" role="alert">
        <CheckCircle size={16} style={{ color: 'var(--accent-success)', flexShrink: 0 }} />
        <span style={{ flex: 1 }}>应用已就绪，开始创作之旅</span>
        <button
          onClick={() => { window.location.hash = '#/'; }}
          style={{
            border: 'none',
            background: 'var(--accent-primary)',
            color: '#fff',
            cursor: 'pointer',
            padding: '3px 10px',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--fs-xs)',
            fontWeight: 'var(--fw-medium)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            whiteSpace: 'nowrap',
          }}
        >
          <Eye size={12} />
          查看
        </button>
        <IconButton onClick={onClose} aria-label="关闭通知">
          <X size={14} />
        </IconButton>
      </div>
    </div>
  );
}

function TaskIndicator({ count, onClick }) {
  const [hovering, setHovering] = useState(false);

  if (count === 0) return null;

  return (
    <div
      data-component="Task Indicator Wrapper"
      style={{ position: 'fixed', bottom: 'var(--sp-6)', right: 'var(--sp-6)', zIndex: 'var(--z-panel)' }}
    >
      {hovering && (
        <div
          style={{
            position: 'absolute',
            bottom: '56px',
            right: '0',
            background: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            fontSize: 'var(--fs-xs)',
            padding: 'var(--sp-2) var(--sp-3)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            whiteSpace: 'nowrap',
            border: '1px solid var(--border-subtle)',
            pointerEvents: 'none',
          }}
        >
          {`${count} 个任务进行中`}
        </div>
      )}
      <button
        onMouseEnter={(e) => {
          setHovering(true);
          e.currentTarget.style.transform = 'scale(1.08)';
          e.currentTarget.style.background = 'var(--accent-hover)';
        }}
        onMouseLeave={(e) => {
          setHovering(false);
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.background = 'var(--accent-primary)';
        }}
        onClick={onClick}
        style={{
          width: '48px',
          height: '48px',
          borderRadius: 'var(--radius-circle)',
          background: 'var(--accent-primary)',
          color: 'var(--text-on-accent)',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: 'var(--shadow-lg)',
          transition: 'transform var(--transition-fast), background var(--transition-fast)',
        }}
        aria-label={`打开任务面板，${count} 个进行中任务`}
      >
        <Layers size={20} />
        <span
          style={{
            position: 'absolute',
            top: '-4px',
            right: '-4px',
            minWidth: '20px',
            height: '20px',
            borderRadius: 'var(--radius-pill)',
            background: 'var(--accent-danger)',
            color: 'var(--text-on-accent)',
            fontSize: 'var(--fs-xs)',
            fontWeight: 'var(--fw-semibold)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 5px',
          }}
        >
          {count}
        </span>
      </button>
    </div>
  );
}

/**
 * GlobalLightbox – renders Lightbox at the app level so it works from any page.
 * Resolves the image list from useGenerationStore (results) or useGalleryStore (images).
 */
function GlobalLightbox() {
  const lightboxOpen = useUIStore(s => s.lightboxOpen);
  const lightboxImageId = useUIStore(s => s.lightboxImageId);
  const closeLightbox = useUIStore(s => s.closeLightbox);
  const results = useGenerationStore(s => s.results);
  const galleryImages = useGalleryStore(s => s.images);

  // Determine which image list contains the target image
  let images = [];
  let currentIndex = 0;

  if (lightboxImageId != null) {
    const inResults = results.find(r => r.id === lightboxImageId);
    const inGallery = galleryImages.find(g => g.id === lightboxImageId);

    if (inResults) {
      images = results;
      currentIndex = results.findIndex(r => r.id === lightboxImageId);
    } else if (inGallery) {
      images = galleryImages;
      currentIndex = galleryImages.findIndex(g => g.id === lightboxImageId);
    } else {
      // Image not in either store – wrap the id as a minimal placeholder
      images = [{ id: lightboxImageId, url: null, prompt: '加载中...' }];
      currentIndex = 0;
    }
  }

  return (
    <Lightbox
      isOpen={lightboxOpen}
      onClose={closeLightbox}
      images={images}
      currentIndex={Math.max(0, currentIndex)}
    />
  );
}

/**
 * Inner app component – has access to router context.
 * Wires up global shortcuts and scope management.
 */
function AppInner() {
  const [toastVisible, setToastVisible] = useState(true);

  // Zustand store subscriptions
  const taskPanelOpen = useUIStore((s) => s.taskPanelOpen);
  const toggleTaskPanel = useUIStore((s) => s.toggleTaskPanel);
  const closeTaskPanel = useUIStore((s) => s.closeTaskPanel);
  const activeTaskCount = useTaskStore((s) => s.activeTaskCount);
  const loadTasks = useTaskStore((s) => s.loadTasks);
  const theme = useUIStore((s) => s.theme);

  // Shortcut overlay state
  const shortcutOverlayOpen = useUIStore((s) => s.shortcutOverlayOpen);
  const setShortcutOverlayOpen = useUIStore((s) => s.setShortcutOverlayOpen);

  // Mask editor state
  const maskEditorOpen = useUIStore((s) => s.maskEditorOpen);
  const maskEditorImage = useUIStore((s) => s.maskEditorImage);
  const maskEditorOnConfirm = useUIStore((s) => s.maskEditorOnConfirm);
  const closeMaskEditor = useUIStore((s) => s.closeMaskEditor);

  // Global shortcuts
  const shortcutContext = useGlobalShortcuts();

  // Manage scope activation
  useShortcutScopes(shortcutContext);

  // Load tasks on mount and initialize TaskEngine bridge
  useEffect(() => {
    loadTasks();
    const cleanup = useTaskStore.getState().initBridge();
    return () => {
      if (cleanup) cleanup();
    };
  }, [loadTasks]);

  // Request notification permission on mount
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  // Toast auto-hide
  useEffect(() => {
    const timer = setTimeout(() => {
      setToastVisible(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // Use store value for task count
  const taskCount = activeTaskCount;

  return (
    <div
      data-component="App Shell"
      data-theme={theme}
      data-style="studio"
      style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}
    >
      <nav data-component="Navigation Sidebar" aria-label="主导航">
        <Sidebar />
      </nav>
      <main
        data-component="Main Content"
        style={{
          flex: 1,
          overflowY: 'auto',
          background: 'var(--bg-base)',
          position: 'relative',
        }}
      >
        <Suspense fallback={<LoadingSkeleton />}>
          <Routes>
            <Route path="/" element={<Workbench />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/knowledge-base" element={<KnowledgeBase />} />
            <Route path="/task-center" element={<TaskCenter />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/setup" element={<SetupWizard />} />
            <Route path="/api-test" element={<ApiTest />} />
          </Routes>
        </Suspense>
      </main>

      <TaskIndicator count={taskCount} onClick={toggleTaskPanel} />
      <TaskPanel isOpen={taskPanelOpen} onClose={closeTaskPanel} />
      <Toast visible={toastVisible} onClose={() => setToastVisible(false)} />

      {/* Shortcut overlay (? key) */}
      <ShortcutOverlay
        isOpen={shortcutOverlayOpen}
        onClose={() => setShortcutOverlayOpen(false)}
      />

      {/* Global Lightbox (accessible from any page) */}
      <GlobalLightbox />

      {/* Mask editor (opened from Workbench) */}
      <MaskEditor
        isOpen={maskEditorOpen}
        onClose={closeMaskEditor}
        sourceImage={maskEditorImage}
        onConfirm={maskEditorOnConfirm}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <HotkeysProvider initiallyActiveScopes={['global']}>
        <HashRouter>
          <AppInner />
        </HashRouter>
      </HotkeysProvider>
    </ErrorBoundary>
  );
}
