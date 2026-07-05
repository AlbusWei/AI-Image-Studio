import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Wand2, Images, Clock, Star, BookOpen, Settings, ListTodo,
  ChevronRight, PanelLeftClose, PanelLeftOpen, Sparkles,
  Folder, FolderOpen, Plus, Trash2, Edit3, FlaskConical,
} from 'lucide-react';
import { useGalleryStore } from '../stores/useGalleryStore';
import { useUIStore } from '../stores/useUIStore';

const navItems = [
  { label: '生成', icon: Wand2, to: '/', exact: true },
  { type: 'divider' },
  { label: '全部图片', icon: Images, to: '/gallery' },
  { label: '最近生成', icon: Clock, to: '/gallery?filter=recent' },
  { label: '收藏', icon: Star, to: '/gallery?filter=favorites' },
  { label: '知识库', icon: BookOpen, to: '/knowledge-base' },
  { type: 'divider' },
];

const bottomItems = [
  { label: '设置', icon: Settings, to: '/settings' },
  { label: '任务中心', icon: ListTodo, to: '/task-center' },
  { label: 'API测试', icon: FlaskConical, to: '/api-test' },
];

/* Build tree from flat folder list */
function buildFolderTree(folders) {
  const map = {};
  const roots = [];
  for (const f of folders) {
    map[f.id] = { ...f, children: [] };
  }
  for (const f of folders) {
    if (f.parentId && map[f.parentId]) {
      map[f.parentId].children.push(map[f.id]);
    } else {
      roots.push(map[f.id]);
    }
  }
  return roots;
}

function FolderItem({ folder, collapsed, depth = 0, onRename, onDelete, onAddSubfolder, onContextMenuOpen, onFolderClick, activeFolderId, renamingFolder, setRenamingFolder, renameValue, setRenameValue, onDrop }) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = folder.children && folder.children.length > 0;
  const isRenaming = renamingFolder === folder.id;
  const isActive = activeFolderId === folder.id;
  const renameInputRef = useRef(null);

  useEffect(() => {
    if (isRenaming && renameInputRef.current) { renameInputRef.current.focus(); renameInputRef.current.select(); }
  }, [isRenaming]);

  const handleRenameSubmit = () => {
    if (renameValue.trim()) onRename(folder.id, renameValue.trim());
    setRenamingFolder(null); setRenameValue('');
  };
  const handleRenameKeyDown = (e) => {
    if (e.key === 'Enter') handleRenameSubmit();
    else if (e.key === 'Escape') { setRenamingFolder(null); setRenameValue(''); }
  };
  const handleDoubleClick = (e) => { e.stopPropagation(); setRenamingFolder(folder.id); setRenameValue(folder.name); };
  const handleContextMenu = (e) => { e.preventDefault(); e.stopPropagation(); onContextMenuOpen({ x: e.clientX, y: e.clientY, folderId: folder.id, folderName: folder.name }); };
  const handleAddSubfolder = (e) => { e.stopPropagation(); onAddSubfolder(folder.id); };

  const handleDragOver = (e) => { e.preventDefault(); e.currentTarget.style.background = 'rgba(108,92,231,0.12)'; };
  const handleDragLeave = (e) => { e.currentTarget.style.background = 'transparent'; };
  const handleDropEvent = (e) => { e.preventDefault(); e.currentTarget.style.background = 'transparent'; onDrop(folder.id); };

  return (
    <div>
      <div
        onClick={() => { if (hasChildren) setExpanded(!expanded); onFolderClick(folder.id); }}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDropEvent}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '6px 12px', paddingLeft: `${12 + depth * 16}px`, paddingRight: '6px',
          cursor: 'pointer', borderRadius: 'var(--radius-md)',
          color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
          background: isActive ? 'rgba(108,92,231,0.12)' : 'transparent',
          fontSize: 'var(--fs-sm)', transition: 'all var(--transition-fast)',
          whiteSpace: 'nowrap', overflow: 'hidden', position: 'relative',
        }}
        onMouseEnter={(e) => {
          if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
          e.currentTarget.style.color = 'var(--text-primary)';
          const addBtn = e.currentTarget.querySelector('[data-add-subfolder]');
          if (addBtn) addBtn.style.opacity = '1';
        }}
        onMouseLeave={(e) => {
          if (!isActive) e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = isActive ? 'var(--text-primary)' : 'var(--text-secondary)';
          const addBtn = e.currentTarget.querySelector('[data-add-subfolder]');
          if (addBtn) addBtn.style.opacity = '0';
        }}
      >
        {hasChildren ? (
          <ChevronRight size={14} style={{ flexShrink: 0, transition: 'transform var(--transition-fast)', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }} />
        ) : <span style={{ width: 14, flexShrink: 0 }} />}
        {expanded && hasChildren ? <FolderOpen size={15} style={{ flexShrink: 0, color: 'var(--accent-primary)' }} /> : <Folder size={15} style={{ flexShrink: 0 }} />}
        {!collapsed && (
          isRenaming ? (
            <input ref={renameInputRef} value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onKeyDown={handleRenameKeyDown} onBlur={handleRenameSubmit} onClick={(e) => e.stopPropagation()}
              style={{ flex: 1, minWidth: 0, background: 'var(--bg-input)', border: '1px solid var(--accent-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: 'var(--fs-sm)', padding: '1px 6px', outline: 'none', fontFamily: 'var(--font-sans)' }} />
          ) : (
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{folder.name}</span>
          )
        )}
        {!collapsed && (
          <button data-add-subfolder="true" onClick={handleAddSubfolder}
            style={{ opacity: 0, background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'opacity var(--transition-fast)', flexShrink: 0 }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent-primary)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}>
            <Plus size={13} />
          </button>
        )}
      </div>
      {expanded && hasChildren && !collapsed && (
        <div>{folder.children.map((child) => (
          <FolderItem key={child.id} folder={child} collapsed={collapsed} depth={depth + 1} onRename={onRename} onDelete={onDelete} onAddSubfolder={onAddSubfolder} onContextMenuOpen={onContextMenuOpen} onFolderClick={onFolderClick} activeFolderId={activeFolderId} renamingFolder={renamingFolder} setRenamingFolder={setRenamingFolder} renameValue={renameValue} setRenameValue={setRenameValue} onDrop={onDrop} />
        ))}</div>
      )}
    </div>
  );
}

function NavItem({ item, collapsed, isActive }) {
  const Icon = item.icon;
  const style = {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: collapsed ? '8px 0' : '8px 12px', justifyContent: collapsed ? 'center' : 'flex-start',
    borderRadius: 'var(--radius-md)', textDecoration: 'none', fontSize: 'var(--fs-base)',
    fontWeight: isActive ? 'var(--fw-medium)' : 'var(--fw-normal)',
    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
    background: isActive ? 'rgba(108, 92, 231, 0.12)' : 'transparent',
    transition: 'all var(--transition-fast)', position: 'relative', whiteSpace: 'nowrap',
  };
  const content = (<><Icon size={18} style={{ flexShrink: 0 }} />{!collapsed && <span>{item.label}</span>}</>);
  if (collapsed) return <Link to={item.to} style={style} data-tooltip={item.label}>{content}</Link>;
  return (
    <Link to={item.to} style={style}
      onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'var(--text-primary)'; } }}
      onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; } }}>
      {content}
    </Link>
  );
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const storeFolders = useGalleryStore((s) => s.folders);
  const currentFolder = useGalleryStore((s) => s.currentFolder);
  const loadFolders = useGalleryStore((s) => s.loadFolders);
  const createFolder = useGalleryStore((s) => s.createFolder);
  const renameFolder = useGalleryStore((s) => s.renameFolder);
  const deleteFolder = useGalleryStore((s) => s.deleteFolder);
  const setCurrentFolder = useGalleryStore((s) => s.setCurrentFolder);
  const moveImages = useGalleryStore((s) => s.moveImages);
  const addToast = useUIStore((s) => s.addToast);

  const folderTree = buildFolderTree(storeFolders);

  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const newFolderInputRef = useRef(null);
  const [renamingFolder, setRenamingFolder] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [contextMenu, setContextMenu] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [addingSubfolderTo, setAddingSubfolderTo] = useState(null);
  const [subfolderName, setSubfolderName] = useState('');
  const subfolderInputRef = useRef(null);

  useEffect(() => { loadFolders() }, []);
  useEffect(() => { if (showNewFolder && newFolderInputRef.current) newFolderInputRef.current.focus(); }, [showNewFolder]);
  useEffect(() => { if (addingSubfolderTo && subfolderInputRef.current) subfolderInputRef.current.focus(); }, [addingSubfolderTo]);
  useEffect(() => { const handler = () => setContextMenu(null); document.addEventListener('click', handler); return () => document.removeEventListener('click', handler); }, []);

  const isActive = (item) => {
    if (item.exact) return location.pathname === item.to;
    const toPath = item.to.split('?')[0];
    const toSearch = item.to.includes('?') ? '?' + item.to.split('?')[1] : '';
    if (toSearch) return location.pathname === toPath && location.search === toSearch;
    return location.pathname === toPath;
  };

  const handleAddRootFolder = () => { setShowNewFolder(true); setNewFolderName(''); };
  const handleNewFolderSubmit = async () => {
    if (newFolderName.trim()) {
      try { await createFolder(newFolderName.trim()); addToast('文件夹已创建', { type: 'success' }); }
      catch { addToast('创建文件夹失败', { type: 'error' }); }
    }
    setShowNewFolder(false); setNewFolderName('');
  };
  const handleNewFolderKeyDown = (e) => {
    if (e.key === 'Enter') handleNewFolderSubmit();
    else if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName(''); }
  };

  const handleRename = async (folderId, newName) => {
    try { await renameFolder(folderId, newName); }
    catch { addToast('重命名失败', { type: 'error' }); }
  };

  const handleDelete = async (folderId) => {
    try { await deleteFolder(folderId); setDeleteConfirm(null); addToast('文件夹已删除', { type: 'success' }); }
    catch { addToast('删除文件夹失败', { type: 'error' }); }
  };

  const handleAddSubfolder = (parentId) => { setAddingSubfolderTo(parentId); setSubfolderName(''); };
  const handleSubfolderSubmit = async () => {
    if (subfolderName.trim() && addingSubfolderTo) {
      try { await createFolder(subfolderName.trim(), addingSubfolderTo); }
      catch { addToast('创建子文件夹失败', { type: 'error' }); }
    }
    setAddingSubfolderTo(null); setSubfolderName('');
  };
  const handleSubfolderKeyDown = (e) => {
    if (e.key === 'Enter') handleSubfolderSubmit();
    else if (e.key === 'Escape') { setAddingSubfolderTo(null); setSubfolderName(''); }
  };

  const handleFolderClick = (folderId) => {
    setCurrentFolder(folderId);
    navigate(`/gallery?folder=${folderId}`);
  };

  const handleDrop = (folderId) => {
    // Get selected images from store and move them
    const { selectedImages } = useGalleryStore.getState();
    if (selectedImages.length > 0) {
      moveImages(selectedImages, folderId)
        .then(() => addToast(`已移动 ${selectedImages.length} 张图片`, { type: 'success' }))
        .catch(() => addToast('移动失败', { type: 'error' }));
    }
  };

  return (
    <aside style={{
      width: collapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-width)',
      minWidth: collapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-width)',
      height: '100vh', background: 'var(--bg-panel)', borderRight: '1px solid var(--border-subtle)',
      display: 'flex', flexDirection: 'column', transition: 'width var(--transition-base), min-width var(--transition-base)',
      overflow: 'hidden', position: 'relative', zIndex: 'var(--z-sidebar)',
    }} onContextMenu={(e) => {}}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: collapsed ? '16px 0' : '16px 14px', justifyContent: collapsed ? 'center' : 'flex-start', borderBottom: '1px solid var(--border-subtle)', minHeight: '52px' }}>
        <Sparkles size={20} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
        {!collapsed && <span style={{ fontWeight: 'var(--fw-semibold)', fontSize: 'var(--fs-lg)', color: 'var(--text-primary)', letterSpacing: 'var(--ls-tight)', whiteSpace: 'nowrap' }}>AI Image Studio</span>}
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: collapsed ? '8px 6px' : '8px 10px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {navItems.map((item, idx) => {
          if (item.type === 'divider') return <div key={`div-${idx}`} style={{ height: '1px', background: 'var(--border-subtle)', margin: '8px 4px' }} />;
          return <NavItem key={item.label} item={item} collapsed={collapsed} isActive={isActive(item)} />;
        })}

        {/* Folder Tree */}
        {!collapsed && (
          <div style={{ marginTop: '4px', marginBottom: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 12px', marginBottom: '2px' }}>
              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 'var(--ls-wide)', fontWeight: 'var(--fw-semibold)' }}>文件夹</span>
              <button onClick={handleAddRootFolder} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'color var(--transition-fast)' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent-primary)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}>
                <Plus size={14} />
              </button>
            </div>

            {showNewFolder && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 12px', paddingLeft: '38px' }}>
                <Folder size={15} style={{ flexShrink: 0, color: 'var(--accent-primary)' }} />
                <input ref={newFolderInputRef} value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} onKeyDown={handleNewFolderKeyDown} onBlur={handleNewFolderSubmit} placeholder="文件夹名称..."
                  style={{ flex: 1, minWidth: 0, background: 'var(--bg-input)', border: '1px solid var(--accent-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: 'var(--fs-sm)', padding: '2px 8px', outline: 'none', fontFamily: 'var(--font-sans)' }} />
              </div>
            )}

            {folderTree.length === 0 && !showNewFolder && (
              <div style={{ padding: '8px 12px 8px 38px', color: 'var(--text-muted)', fontSize: 'var(--fs-xs)' }}>暂无文件夹，点击 + 创建</div>
            )}

            {folderTree.map((folder) => (
              <React.Fragment key={folder.id}>
                <FolderItem folder={folder} collapsed={collapsed} onRename={handleRename} onDelete={handleDelete} onAddSubfolder={handleAddSubfolder} onContextMenuOpen={setContextMenu} onFolderClick={handleFolderClick} activeFolderId={currentFolder} renamingFolder={renamingFolder} setRenamingFolder={setRenamingFolder} renameValue={renameValue} setRenameValue={setRenameValue} onDrop={handleDrop} />
                {addingSubfolderTo === folder.id && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 12px', paddingLeft: `${12 + 1 * 16 + 22}px` }}>
                    <Folder size={14} style={{ flexShrink: 0, color: 'var(--accent-primary)' }} />
                    <input ref={subfolderInputRef} value={subfolderName} onChange={(e) => setSubfolderName(e.target.value)} onKeyDown={handleSubfolderKeyDown} onBlur={handleSubfolderSubmit} placeholder="子文件夹名称..."
                      style={{ flex: 1, minWidth: 0, background: 'var(--bg-input)', border: '1px solid var(--accent-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: 'var(--fs-sm)', padding: '2px 8px', outline: 'none', fontFamily: 'var(--font-sans)' }} />
                  </div>
                )}
                {folder.children && folder.children.map((child) => (
                  addingSubfolderTo === child.id ? (
                    <div key={`sub-${child.id}`} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 12px', paddingLeft: `${12 + 2 * 16 + 22}px` }}>
                      <Folder size={14} style={{ flexShrink: 0, color: 'var(--accent-primary)' }} />
                      <input ref={subfolderInputRef} value={subfolderName} onChange={(e) => setSubfolderName(e.target.value)} onKeyDown={handleSubfolderKeyDown} onBlur={handleSubfolderSubmit} placeholder="子文件夹名称..."
                        style={{ flex: 1, minWidth: 0, background: 'var(--bg-input)', border: '1px solid var(--accent-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: 'var(--fs-sm)', padding: '2px 8px', outline: 'none', fontFamily: 'var(--font-sans)' }} />
                    </div>
                  ) : null
                ))}
              </React.Fragment>
            ))}
          </div>
        )}
        {collapsed && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }} data-tooltip="文件夹">
            <Folder size={18} style={{ color: 'var(--text-tertiary)' }} />
          </div>
        )}

        <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '8px 4px' }} />
        {bottomItems.map((item) => <NavItem key={item.label} item={item} collapsed={collapsed} isActive={isActive(item)} />)}
      </nav>

      {/* Collapse Toggle */}
      <div style={{ borderTop: '1px solid var(--border-subtle)', padding: collapsed ? '10px 0' : '10px 14px', display: 'flex', justifyContent: collapsed ? 'center' : 'flex-start' }}>
        <button onClick={() => setCollapsed(!collapsed)}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '6px 8px', borderRadius: 'var(--radius-md)', fontSize: 'var(--fs-sm)', transition: 'all var(--transition-fast)', fontFamily: 'var(--font-sans)' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-tertiary)'; }}>
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          {!collapsed && <span>收起侧栏</span>}
        </button>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, minWidth: 140, background: 'var(--bg-panel)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', zIndex: 9999, overflow: 'hidden', padding: '4px 0' }}
          onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 14px', fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', cursor: 'pointer', transition: 'background var(--transition-fast)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            onClick={() => { setRenamingFolder(contextMenu.folderId); setRenameValue(contextMenu.folderName); setContextMenu(null); }}>
            <Edit3 size={13} />重命名
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 14px', fontSize: 'var(--fs-sm)', color: 'var(--accent-danger, #e74c3c)', cursor: 'pointer', transition: 'background var(--transition-fast)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(231,76,60,0.08)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            onClick={() => { setDeleteConfirm(contextMenu.folderId); setContextMenu(null); }}>
            <Trash2 size={13} />删除
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {deleteConfirm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setDeleteConfirm(null)}>
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-dialog)', padding: '20px', width: 320 }}
            onClick={(e) => e.stopPropagation()}>
            <p className="text-sm" style={{ color: 'var(--text-secondary)', marginBottom: 'var(--sp-4)', lineHeight: 'var(--lh-relaxed)' }}>删除文件夹后，图片将移至"未分类"</p>
            <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setDeleteConfirm(null)}>取消</button>
              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(deleteConfirm)}><Trash2 size={14} /> 确认删除</button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
