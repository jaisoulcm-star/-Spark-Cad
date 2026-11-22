import React, { useState, useRef } from 'react';
import { CADDesign, Category, ContactMessage, User, PlatformStats } from '../types';
import { moveItemInArray, parseDroppedCadFileMeta } from '../utils/cadHelpers';
import {
  Plus,
  ShieldAlert,
  Users,
  FolderTree,
  RotateCcw,
  UploadCloud,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Edit,
  Trash2,
  CheckCircle2,
  AlertCircle,
  X,
  Eye,
  Mail,
  Search,
  Check,
  Shield,
} from 'lucide-react';

export interface BatchDesignUploadItem extends Partial<CADDesign> {
  fileDataBase64?: string;
  previewDataBase64?: string;
  originalFilename?: string;
}

interface StagedFileDesign {
  localId: string;
  originalFilename: string;
  title: string;
  description: string;
  category: string;
  software: CADDesign['software'];
  format: CADDesign['format'];
  complexity: CADDesign['complexity'];
  fileSize: string;
  previewUrl: string;
  status: 'published' | 'draft';
  tags: string[];
  fileDataBase64?: string;
  previewDataBase64?: string;
}

interface AdminDashboardProps {
  designs: CADDesign[];
  categories: Category[];
  users: User[];
  inquiries: ContactMessage[];
  currentUserId?: string;
  stats: PlatformStats | null;
  onRefreshData: () => void;
  onOpenUploadModal: () => void;
  onViewDesign?: (design: CADDesign) => void;
  onToggleDesignStatus?: (design: CADDesign) => Promise<void>;
  onEditDesign: (design: CADDesign) => void;
  onDeleteDesign: (designId: string) => void;
  onCreateCategory?: (name: string, description: string) => Promise<{ success: boolean; error?: string }>;
  onUpdateCategory?: (id: string, name: string, description: string) => Promise<{ success: boolean; error?: string }>;
  onDeleteCategory?: (id: string) => Promise<{ success: boolean; error?: string }>;
  onUpdateUserRole?: (userId: string, role: 'admin' | 'user') => Promise<void>;
  onDeleteUser?: (userId: string) => Promise<void>;
  onUpdateInquiryStatus?: (id: string, status: 'new' | 'resolved') => Promise<void>;
  onDeleteInquiry?: (id: string) => Promise<void>;
  onResetDashboard?: () => Promise<boolean>;
  onBatchUploadDesigns?: (items: BatchDesignUploadItem[]) => Promise<boolean>;
  onReorderDesigns?: (orderedIds: string[]) => Promise<void>;
  onMoveDesignCategory?: (designId: string, category: string) => Promise<void>;
}

const FALLBACK_PREVIEW = '/src/assets/images/cad_electrical_panel_1795206880418.jpg';

export function AdminDashboard({
  designs,
  categories,
  users,
  inquiries,
  currentUserId,
  stats,
  onOpenUploadModal,
  onViewDesign,
  onToggleDesignStatus,
  onEditDesign,
  onDeleteDesign,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
  onUpdateUserRole,
  onDeleteUser,
  onUpdateInquiryStatus,
  onDeleteInquiry,
  onResetDashboard,
  onBatchUploadDesigns,
  onReorderDesigns,
  onMoveDesignCategory,
}: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<'categories' | 'users' | 'inquiries'>('categories');
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [designSearch, setDesignSearch] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [catError, setCatError] = useState('');
  const [creatingCat, setCreatingCat] = useState(false);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState('');
  const [editCatDesc, setEditCatDesc] = useState('');

  // Batch Drag & Drop Upload State
  const [isDropzoneActive, setIsDropzoneActive] = useState(false);
  const [stagedDesigns, setStagedDesigns] = useState<StagedFileDesign[]>([]);
  const [uploadingBatch, setUploadingBatch] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drag & Drop Design Reordering & Category Drop State
  const [draggedDesignId, setDraggedDesignId] = useState<string | null>(null);
  const [dragOverDesignId, setDragOverDesignId] = useState<string | null>(null);
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null);

  const filteredAdminDesigns = designSearch.trim()
    ? designs.filter((d) => {
        const q = designSearch.trim().toLowerCase();
        return (
          d.title.toLowerCase().includes(q) ||
          d.category.toLowerCase().includes(q) ||
          d.software.toLowerCase().includes(q) ||
          d.format.toLowerCase().includes(q)
        );
      })
    : designs;
  const openInquiryCount = inquiries.filter((m) => m.status === 'new').length;

  const stageFiles = async (files: FileList | File[]) => {
    const fileList = Array.from(files);
    if (fileList.length === 0) return;

    const readFileAsDataUrl = (file: File): Promise<string> =>
      new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
      });

    const newItems: StagedFileDesign[] = await Promise.all(
      fileList.map(async (file, idx) => {
        const isImageFile =
          file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(file.name);
        const meta = parseDroppedCadFileMeta(file.name, file.size);
        const validCategory = categories.some((c) => c.name === meta.category)
          ? meta.category
          : categories[0]?.name || meta.category;
        const fileDataBase64 = await readFileAsDataUrl(file);

        return {
          localId: `staged-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
          originalFilename: file.name,
          title: meta.title,
          description: meta.description,
          category: validCategory,
          software: meta.software,
          format: meta.format,
          complexity: 'Intermediate',
          fileSize: meta.fileSize,
          previewUrl: isImageFile && fileDataBase64 ? fileDataBase64 : meta.previewUrl,
          status: 'published',
          tags: meta.tags,
          fileDataBase64,
          ...(isImageFile && fileDataBase64 ? { previewDataBase64: fileDataBase64 } : {}),
        };
      })
    );

    setStagedDesigns((prev) => [...prev, ...newItems]);
  };

  const handleUpdateStaged = (localId: string, patch: Partial<StagedFileDesign>) => {
    setStagedDesigns((prev) =>
      prev.map((item) => (item.localId === localId ? { ...item, ...patch } : item))
    );
  };

  const handleRemoveStaged = (localId: string) => {
    setStagedDesigns((prev) => prev.filter((item) => item.localId !== localId));
  };

  const handlePublishAllStaged = async () => {
    if (!onBatchUploadDesigns || stagedDesigns.length === 0) return;
    setUploadingBatch(true);
    try {
      const ok = await onBatchUploadDesigns(
        stagedDesigns.map(({ localId: _id, ...payload }) => payload)
      );
      if (ok) {
        setStagedDesigns([]);
      }
    } finally {
      setUploadingBatch(false);
    }
  };

  const handleDesignDropOnDesign = async (targetId: string) => {
    if (!draggedDesignId || draggedDesignId === targetId || !onReorderDesigns) {
      setDraggedDesignId(null);
      setDragOverDesignId(null);
      return;
    }
    const ids = designs.map((d) => d.id);
    const fromIdx = ids.indexOf(draggedDesignId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx !== -1 && toIdx !== -1) {
      const reordered = moveItemInArray(ids, fromIdx, toIdx);
      await onReorderDesigns(reordered);
    }
    setDraggedDesignId(null);
    setDragOverDesignId(null);
  };

  const handleMoveDesignOffset = async (index: number, delta: -1 | 1) => {
    if (!onReorderDesigns) return;
    const targetIdx = index + delta;
    if (targetIdx < 0 || targetIdx >= designs.length) return;
    const ids = designs.map((d) => d.id);
    const reordered = moveItemInArray(ids, index, targetIdx);
    await onReorderDesigns(reordered);
  };

  const handleDropDesignOnCategory = async (categoryName: string) => {
    if (draggedDesignId && onMoveDesignCategory) {
      await onMoveDesignCategory(draggedDesignId, categoryName);
    }
    setDraggedDesignId(null);
    setDragOverCategory(null);
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreateCategory) return;
    setCatError('');
    if (!newCatName.trim()) {
      setCatError('Category name is required.');
      return;
    }
    setCreatingCat(true);
    const res = await onCreateCategory(newCatName, newCatDesc);
    setCreatingCat(false);
    if (res.success) {
      setNewCatName('');
      setNewCatDesc('');
    } else {
      setCatError(res.error || 'Could not create category.');
    }
  };

  const handleConfirmReset = async () => {
    setResetting(true);
    try {
      const ok = onResetDashboard ? await onResetDashboard() : true;
      if (ok) {
        setActiveTab('categories');
        setStagedDesigns([]);
        setDeleteConfirmId(null);
        setNewCatName('');
        setNewCatDesc('');
        setCatError('');
        setResetModalOpen(false);
      }
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-6 sm:py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Admin Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 sm:mb-8 pb-5 sm:pb-6 border-b border-slate-200 gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="p-2.5 bg-white border border-slate-200 rounded-xl text-blue-700 shadow-xs shrink-0">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Admin Dashboard</h1>
              <p className="text-slate-600 text-xs sm:text-sm mt-0.5">Manage CAD designs, categories, user permissions, and download analytics.</p>
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2.5 sm:gap-3 w-full md:w-auto">
            <button
              type="button"
              onClick={() => setResetModalOpen(true)}
              className="w-full sm:w-auto min-h-[44px] sm:min-h-0 justify-center bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold text-xs sm:text-sm px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              <RotateCcw className="w-4 h-4 text-slate-500" />
              <span>Reset Dashboard</span>
            </button>

            <button
              type="button"
              onClick={onOpenUploadModal}
              className="w-full sm:w-auto min-h-[44px] sm:min-h-0 justify-center bg-blue-700 hover:bg-blue-800 text-white font-semibold text-xs sm:text-sm px-5 py-2.5 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Upload New CAD Design</span>
            </button>
          </div>
        </div>

        {/* Stats Row */}
        {stats && (
          <div className="grid grid-cols-2 gap-3 sm:gap-6 mb-6 sm:mb-8">
            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 shadow-xs">
              <div className="text-[11px] sm:text-xs font-semibold text-slate-500 mb-1">Published CAD Designs</div>
              <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tabular-nums">{stats.totalDesigns}</div>
              <div className="text-[11px] sm:text-xs text-slate-500 mt-1.5">Publicly listed in library</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 shadow-xs">
              <div className="text-[11px] sm:text-xs font-semibold text-slate-500 mb-1">Total Downloads</div>
              <div className="text-2xl sm:text-3xl font-extrabold text-blue-700 tabular-nums">{stats.totalDownloads.toLocaleString()}</div>
              <div className="text-[11px] sm:text-xs text-slate-500 mt-1.5">Global engineering downloads</div>
            </div>
          </div>
        )}

        {/* Drag & Drop CAD Designs Workspace */}
        <section aria-label="Drag and Drop CAD Designs" className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 mb-6 sm:mb-8 shadow-xs space-y-5 sm:space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Drag & Drop CAD Designs</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Drop multiple CAD files to batch upload, or drag uploaded designs to reorder and assign categories.
              </p>
            </div>
            {designs.length > 0 && (
              <span className="text-xs font-semibold text-slate-600 tabular-nums self-start sm:self-auto">
                {designs.length} {designs.length === 1 ? 'Design' : 'Designs'} Uploaded
              </span>
            )}
          </div>

          {/* Multi-file Dropzone */}
          <div
            data-testid="admin-dropzone"
            onDragOver={(e) => {
              if (Array.from(e.dataTransfer.types || []).includes('Files')) {
                e.preventDefault();
                setIsDropzoneActive(true);
              }
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setIsDropzoneActive(false);
              }
            }}
            onDrop={(e) => {
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                e.preventDefault();
                setIsDropzoneActive(false);
                stageFiles(e.dataTransfer.files);
              }
            }}
            className={`rounded-xl border-2 border-dashed p-5 sm:p-8 text-center transition-colors ${
              isDropzoneActive
                ? 'border-blue-700 bg-blue-50'
                : 'border-slate-300 bg-slate-50 hover:border-slate-400'
            }`}
          >
            <input
              ref={fileInputRef}
              data-testid="admin-batch-file-input"
              type="file"
              multiple
              accept=".dwg,.dxf,.pdf,.eplan,.epj,.zw1,.zip"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) {
                  stageFiles(e.target.files);
                }
                e.target.value = '';
              }}
            />
            <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-blue-700 shadow-xs">
              <UploadCloud className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-slate-900 mb-1">
              {isDropzoneActive ? 'Release to stage all CAD files' : 'Drag & drop all CAD design files here'}
            </p>
            <p className="text-xs text-slate-500 mb-5">
              Supports batch uploads for .DWG, .DXF, .PDF, .EPLAN, and .ZIP packages
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full sm:w-auto min-h-[44px] sm:min-h-0 justify-center bg-white hover:bg-slate-100 text-slate-900 text-xs font-semibold px-4 py-2.5 rounded-lg border border-slate-300 transition-colors inline-flex items-center gap-2 shadow-xs"
            >
              <Plus className="w-4 h-4 text-blue-700" />
              <span>Select CAD Files</span>
            </button>
          </div>

          {/* Staged Multi-File Queue */}
          {stagedDesigns.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                <div className="text-xs font-bold text-slate-900 tabular-nums">
                  Staged Files Ready to Upload ({stagedDesigns.length})
                </div>
                <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    disabled={uploadingBatch}
                    onClick={() => setStagedDesigns([])}
                    className="min-h-[44px] sm:min-h-0 justify-center bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-semibold px-3.5 py-2 rounded-lg transition-colors disabled:opacity-60 inline-flex items-center"
                  >
                    Clear Queue
                  </button>
                  <button
                    type="button"
                    disabled={uploadingBatch}
                    onClick={handlePublishAllStaged}
                    className="min-h-[44px] sm:min-h-0 justify-center bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors inline-flex items-center gap-1.5 disabled:opacity-60"
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span className="truncate">
                      {uploadingBatch ? 'Uploading...' : `Upload All (${stagedDesigns.length})`}
                    </span>
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {stagedDesigns.map((item) => (
                  <div
                    key={item.localId}
                    className="bg-white border border-slate-200 rounded-lg p-3.5 grid grid-cols-1 lg:grid-cols-12 gap-3 items-center"
                  >
                    <div className="lg:col-span-4">
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        Title ({item.originalFilename} · {item.fileSize})
                      </label>
                      <input
                        type="text"
                        aria-label={`Design title for ${item.originalFilename}`}
                        value={item.title}
                        onChange={(e) => handleUpdateStaged(item.localId, { title: e.target.value })}
                        className="w-full bg-white text-slate-900 text-xs rounded-lg px-3 py-2 border border-slate-300 focus:outline-none focus:border-blue-700"
                      />
                    </div>
                    <div className="lg:col-span-3">
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        Category
                      </label>
                      <select
                        aria-label={`Category for ${item.originalFilename}`}
                        value={item.category}
                        onChange={(e) => handleUpdateStaged(item.localId, { category: e.target.value })}
                        className="w-full bg-white text-slate-900 text-xs rounded-lg px-2.5 py-2 border border-slate-300 focus:outline-none focus:border-blue-700"
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="lg:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        Software
                      </label>
                      <select
                        aria-label={`Software for ${item.originalFilename}`}
                        value={item.software}
                        onChange={(e) =>
                          handleUpdateStaged(item.localId, {
                            software: e.target.value as CADDesign['software'],
                          })
                        }
                        className="w-full bg-white text-slate-900 text-xs rounded-lg px-2.5 py-2 border border-slate-300 focus:outline-none focus:border-blue-700"
                      >
                        <option value="AutoCAD">AutoCAD</option>
                        <option value="EPLAN">EPLAN</option>
                        <option value="Revit">Revit</option>
                        <option value="SolidWorks">SolidWorks</option>
                        <option value="Inventor">Inventor</option>
                        <option value="Fusion 360">Fusion 360</option>
                      </select>
                    </div>
                    <div className="lg:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        Status
                      </label>
                      <select
                        aria-label={`Status for ${item.originalFilename}`}
                        value={item.status}
                        onChange={(e) =>
                          handleUpdateStaged(item.localId, {
                            status: e.target.value as 'published' | 'draft',
                          })
                        }
                        className="w-full bg-white text-slate-900 text-xs rounded-lg px-2.5 py-2 border border-slate-300 focus:outline-none focus:border-blue-700"
                      >
                        <option value="published">Published</option>
                        <option value="draft">Draft</option>
                      </select>
                    </div>
                    <div className="lg:col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleRemoveStaged(item.localId)}
                        aria-label={`Remove ${item.originalFilename} from queue`}
                        className="min-h-[40px] min-w-[40px] flex items-center justify-center p-2 rounded-lg bg-slate-100 hover:bg-red-50 text-slate-500 hover:text-red-600 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Draggable Uploaded Designs Board */}
          {designs.length > 0 && (
            <div className="space-y-4 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                {/* Category Drop Targets */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500 mr-1">
                    Drop onto category:
                  </span>
                  {categories.map((cat) => (
                    <div
                      key={cat.id}
                      onDragOver={(e) => {
                        if (draggedDesignId) {
                          e.preventDefault();
                          setDragOverCategory(cat.name);
                        }
                      }}
                      onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                          setDragOverCategory(null);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleDropDesignOnCategory(cat.name);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        dragOverCategory === cat.name
                          ? 'border-blue-700 bg-blue-50 text-blue-800'
                          : draggedDesignId
                          ? 'border-dashed border-blue-400 bg-blue-50/50 text-blue-700'
                          : 'border-slate-200 bg-slate-50 text-slate-600'
                      }`}
                    >
                      {cat.name}
                    </div>
                  ))}
                </div>

                {/* Admin Design Search */}
                <div className="relative w-full sm:w-64 shrink-0">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    aria-label="Filter uploaded CAD designs"
                    placeholder="Filter designs..."
                    value={designSearch}
                    onChange={(e) => setDesignSearch(e.target.value)}
                    className="w-full bg-slate-50 focus:bg-white text-slate-900 text-xs rounded-lg pl-9 pr-3 py-2 border border-slate-200 focus:outline-none focus:border-blue-700"
                  />
                </div>
              </div>

              {/* Draggable Designs List */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="draggable-designs-board">
                {filteredAdminDesigns.map((design) => {
                  const idx = designs.findIndex((d) => d.id === design.id);
                  const isDragging = draggedDesignId === design.id;
                  const isDragOver = dragOverDesignId === design.id && draggedDesignId !== design.id;
                  return (
                    <div
                      key={design.id}
                      draggable
                      onDragStart={(e) => {
                        setDraggedDesignId(design.id);
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', design.id);
                      }}
                      onDragOver={(e) => {
                        if (draggedDesignId && draggedDesignId !== design.id) {
                          e.preventDefault();
                          setDragOverDesignId(design.id);
                        }
                      }}
                      onDragLeave={(e) => {
                        if (
                          dragOverDesignId === design.id &&
                          !e.currentTarget.contains(e.relatedTarget as Node)
                        ) {
                          setDragOverDesignId(null);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleDesignDropOnDesign(design.id);
                      }}
                      onDragEnd={() => {
                        setDraggedDesignId(null);
                        setDragOverDesignId(null);
                        setDragOverCategory(null);
                      }}
                      className={`bg-white border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-grab active:cursor-grabbing transition-all ${
                        isDragging
                          ? 'opacity-50 border-blue-700'
                          : isDragOver
                          ? 'border-blue-700 ring-2 ring-blue-700/20 bg-blue-50/30'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex flex-col items-center text-slate-400 shrink-0">
                          <GripVertical className="w-4 h-4" />
                          <span className="text-[10px] font-mono tabular-nums">#{idx + 1}</span>
                        </div>
                        <img
                          src={design.previewUrl || FALLBACK_PREVIEW}
                          alt=""
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            const target = e.currentTarget;
                            if (target.src !== window.location.origin + FALLBACK_PREVIEW) {
                              target.src = FALLBACK_PREVIEW;
                            }
                          }}
                          className="w-12 h-12 rounded-lg object-contain object-center bg-slate-100 border border-slate-200 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 text-sm truncate">{design.title}</div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[11px] text-slate-500">
                            <span className="text-blue-700 font-medium">{design.category}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono font-medium text-slate-700">{design.format}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">{design.fileSize}</span>
                            <span aria-hidden="true">·</span>
                            {onToggleDesignStatus ? (
                              <button
                                type="button"
                                onClick={() => onToggleDesignStatus(design)}
                                title="Click to toggle Published / Draft status"
                                className={`font-semibold capitalize underline decoration-dotted underline-offset-2 ${
                                  design.status === 'published'
                                    ? 'text-emerald-700 hover:text-emerald-800'
                                    : 'text-amber-700 hover:text-amber-800'
                                }`}
                              >
                                {design.status}
                              </button>
                            ) : (
                              <span
                                className={`font-semibold capitalize ${
                                  design.status === 'published'
                                    ? 'text-emerald-700'
                                    : 'text-amber-700'
                                }`}
                              >
                                {design.status}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-1.5 sm:gap-1 shrink-0 pt-3 border-t border-slate-100 sm:pt-0 sm:border-t-0">
                        {onViewDesign && (
                          <button
                            type="button"
                            onClick={() => onViewDesign(design)}
                            aria-label={`View ${design.title}`}
                            title="Open Design Page"
                            className="min-h-[40px] min-w-[40px] sm:min-h-0 sm:min-w-0 flex items-center justify-center p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={idx <= 0}
                          onClick={() => handleMoveDesignOffset(idx, -1)}
                          aria-label={`Move ${design.title} up`}
                          title="Move Earlier"
                          className="min-h-[40px] min-w-[40px] sm:min-h-0 sm:min-w-0 flex items-center justify-center p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 disabled:opacity-30 transition-colors"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === designs.length - 1}
                          onClick={() => handleMoveDesignOffset(idx, 1)}
                          aria-label={`Move ${design.title} down`}
                          title="Move Later"
                          className="min-h-[40px] min-w-[40px] sm:min-h-0 sm:min-w-0 flex items-center justify-center p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 disabled:opacity-30 transition-colors"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onEditDesign(design)}
                          aria-label={`Edit ${design.title}`}
                          title="Edit Design"
                          className="min-h-[40px] min-w-[40px] sm:min-h-0 sm:min-w-0 flex items-center justify-center p-1.5 rounded-lg bg-slate-50 hover:bg-blue-50 border border-slate-200 text-blue-700 transition-colors"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(design.id)}
                          aria-label={`Delete ${design.title}`}
                          title="Delete Design"
                          className="min-h-[40px] min-w-[40px] sm:min-h-0 sm:min-w-0 flex items-center justify-center p-1.5 rounded-lg bg-slate-50 hover:bg-red-50 border border-slate-200 text-red-600 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-3 sm:flex sm:items-center sm:gap-6 border-b border-slate-200 mb-6 sm:mb-8">
          <button
            type="button"
            onClick={() => setActiveTab('categories')}
            className={`flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 pb-3.5 pt-1 min-h-[44px] text-xs sm:text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'categories'
                ? 'border-blue-700 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <FolderTree className="w-4 h-4 shrink-0" />
            <span className="tabular-nums">Categories ({categories.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 pb-3.5 pt-1 min-h-[44px] text-xs sm:text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'users'
                ? 'border-blue-700 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4 shrink-0" />
            <span className="tabular-nums">Users ({users.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('inquiries')}
            className={`flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 pb-3.5 pt-1 min-h-[44px] text-xs sm:text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'inquiries'
                ? 'border-blue-700 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Mail className="w-4 h-4 shrink-0" />
            <span className="tabular-nums">
              Inquiries ({openInquiryCount > 0 ? `${openInquiryCount} new` : inquiries.length})
            </span>
          </button>
        </div>

        {/* Tab 1: Categories */}
        {activeTab === 'categories' && (
          <div className="bg-white border border-slate-200 rounded-xl shadow-xs p-4 sm:p-6 space-y-5 sm:space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h3 className="text-lg font-bold text-slate-900">Engineering Categories</h3>
            </div>

            {onCreateCategory && (
              <form onSubmit={handleAddCategory} className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <div>
                  <label htmlFor="new-cat-name" className="block text-xs font-semibold text-slate-700 mb-1.5">
                    New Category Name
                  </label>
                  <input
                    id="new-cat-name"
                    type="text"
                    placeholder="e.g. Aerospace & Propulsion"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    className="w-full bg-white text-slate-900 text-xs rounded-lg px-3.5 py-2.5 border border-slate-300 focus:outline-none focus:border-blue-700"
                  />
                </div>
                <div>
                  <label htmlFor="new-cat-desc" className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Description
                  </label>
                  <input
                    id="new-cat-desc"
                    type="text"
                    placeholder="Turbine assemblies, avionics harnesses..."
                    value={newCatDesc}
                    onChange={(e) => setNewCatDesc(e.target.value)}
                    className="w-full bg-white text-slate-900 text-xs rounded-lg px-3.5 py-2.5 border border-slate-300 focus:outline-none focus:border-blue-700"
                  />
                </div>
                <div className="flex items-center">
                  <button
                    type="submit"
                    disabled={creatingCat}
                    className="w-full min-h-[44px] sm:min-h-0 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold px-4 py-2.5 rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-60"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{creatingCat ? 'Adding...' : 'Add Category'}</span>
                  </button>
                </div>
                {catError && (
                  <p role="alert" className="md:col-span-3 text-xs text-red-600 font-medium">
                    {catError}
                  </p>
                )}
              </form>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {categories.map((cat) => {
                const isEditing = editingCatId === cat.id;
                return (
                  <div
                    key={cat.id}
                    onDragOver={(e) => {
                      if (draggedDesignId) {
                        e.preventDefault();
                        setDragOverCategory(cat.name);
                      }
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        setDragOverCategory(null);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleDropDesignOnCategory(cat.name);
                    }}
                    className={`bg-white border rounded-xl p-5 transition-colors ${
                      dragOverCategory === cat.name
                        ? 'border-blue-700 ring-2 ring-blue-700/20 bg-blue-50/30'
                        : 'border-slate-200'
                    }`}
                  >
                    {isEditing ? (
                      <div className="space-y-3">
                        <input
                          type="text"
                          value={editCatName}
                          onChange={(e) => setEditCatName(e.target.value)}
                          aria-label="Category name"
                          className="w-full bg-white text-slate-900 text-xs font-semibold rounded-lg px-3 py-2 border border-slate-300 focus:outline-none focus:border-blue-700"
                        />
                        <textarea
                          rows={2}
                          value={editCatDesc}
                          onChange={(e) => setEditCatDesc(e.target.value)}
                          aria-label="Category description"
                          className="w-full bg-white text-slate-700 text-xs rounded-lg px-3 py-2 border border-slate-300 focus:outline-none focus:border-blue-700"
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingCatId(null)}
                            className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!onUpdateCategory) return;
                              const res = await onUpdateCategory(cat.id, editCatName, editCatDesc);
                              if (res.success) setEditingCatId(null);
                              else setCatError(res.error || 'Could not update category.');
                            }}
                            className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg inline-flex items-center gap-1"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Save</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="text-base font-bold text-slate-900">{cat.name}</div>
                          <div className="flex items-center gap-1 shrink-0">
                            {onUpdateCategory && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingCatId(cat.id);
                                  setEditCatName(cat.name);
                                  setEditCatDesc(cat.description);
                                  setCatError('');
                                }}
                                aria-label={`Edit ${cat.name}`}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {onDeleteCategory && categories.length > 1 && (
                              <button
                                type="button"
                                onClick={async () => {
                                  const res = await onDeleteCategory(cat.id);
                                  if (!res.success) setCatError(res.error || 'Could not delete category.');
                                }}
                                aria-label={`Delete ${cat.name}`}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-slate-600 mb-4 leading-relaxed">{cat.description}</p>
                        <div className="flex items-center justify-between pt-3.5 border-t border-slate-100 text-xs">
                          <span className="text-blue-700 font-semibold tabular-nums">{cat.count || 0} CAD Designs</span>
                          <span className="text-slate-400 font-mono">{cat.slug}</span>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 2: Users */}
        {activeTab === 'users' && (
          <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-900">Registered Platform Users</h3>
            </div>

            {/* Mobile Stacked User Cards */}
            <div className="md:hidden divide-y divide-slate-200">
              {users.map((u) => {
                const isSelf = u.id === currentUserId;
                return (
                  <div key={u.id} className="p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-md bg-slate-900 text-white flex items-center justify-center font-bold text-xs shrink-0">
                          {(u.name || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-sm text-slate-900 truncate">{u.name}</div>
                          <div className="text-xs text-slate-500 truncate">{u.email}</div>
                        </div>
                      </div>
                      <span
                        className={`text-xs font-semibold capitalize shrink-0 ${
                          u.role === 'admin' ? 'text-blue-700' : 'text-slate-600'
                        }`}
                      >
                        {u.role}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-[11px]">
                      <div>
                        <div className="text-slate-400">Favorites</div>
                        <div className="font-mono font-semibold text-slate-900 tabular-nums mt-0.5">
                          {u.favorites?.length || 0}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">Downloads</div>
                        <div className="font-mono font-semibold text-slate-900 tabular-nums mt-0.5">
                          {u.downloadHistory?.length || 0}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-slate-400">Joined</div>
                        <div className="font-mono text-slate-600 tabular-nums mt-0.5">{u.createdAt}</div>
                      </div>
                    </div>
                    {!isSelf && (onUpdateUserRole || onDeleteUser) && (
                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                        {onUpdateUserRole && (
                          <button
                            type="button"
                            onClick={() => onUpdateUserRole(u.id, u.role === 'admin' ? 'user' : 'admin')}
                            className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-blue-50 border border-slate-200 text-xs font-semibold text-slate-700 hover:text-blue-700 inline-flex items-center gap-1.5"
                          >
                            <Shield className="w-3.5 h-3.5" />
                            <span>{u.role === 'admin' ? 'Make User' : 'Make Admin'}</span>
                          </button>
                        )}
                        {onDeleteUser && (
                          <button
                            type="button"
                            onClick={() => onDeleteUser(u.id)}
                            aria-label={`Remove ${u.name}`}
                            className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-red-50 border border-slate-200 text-xs font-semibold text-red-600 inline-flex items-center gap-1.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remove</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">User Name</th>
                    <th className="py-3 px-4">Email Address</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4 text-right">Favorites</th>
                    <th className="py-3 px-4 text-right">Downloads</th>
                    <th className="py-3 px-4 text-right">Joined</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs text-slate-700">
                  {users.map((u) => {
                    const isSelf = u.id === currentUserId;
                    return (
                      <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3.5 px-4 font-semibold text-slate-900 flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-md bg-slate-900 text-white flex items-center justify-center font-bold text-xs shrink-0">
                            {(u.name || '?').charAt(0).toUpperCase()}
                          </div>
                          <span>{u.name}</span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-600">{u.email}</td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`font-semibold capitalize ${
                              u.role === 'admin' ? 'text-blue-700' : 'text-slate-600'
                            }`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums">{u.favorites?.length || 0}</td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums">{u.downloadHistory?.length || 0}</td>
                        <td className="py-3.5 px-4 text-right font-mono text-slate-500 tabular-nums">{u.createdAt}</td>
                        <td className="py-3.5 px-4 text-right">
                          {isSelf ? (
                            <span className="text-[11px] text-slate-400 font-medium">Current Admin</span>
                          ) : (
                            <div className="inline-flex items-center gap-1.5">
                              {onUpdateUserRole && (
                                <button
                                  type="button"
                                  onClick={() => onUpdateUserRole(u.id, u.role === 'admin' ? 'user' : 'admin')}
                                  className="px-2.5 py-1 rounded-md bg-white hover:bg-blue-50 border border-slate-200 text-[11px] font-semibold text-slate-700 hover:text-blue-700 transition-colors"
                                >
                                  {u.role === 'admin' ? 'Make User' : 'Make Admin'}
                                </button>
                              )}
                              {onDeleteUser && (
                                <button
                                  type="button"
                                  onClick={() => onDeleteUser(u.id)}
                                  aria-label={`Remove ${u.name}`}
                                  className="p-1.5 rounded-md bg-white hover:bg-red-50 border border-slate-200 text-red-600 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 3: Support Inquiries */}
        {activeTab === 'inquiries' && (
          <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-slate-200 flex items-center justify-between gap-2">
              <h3 className="text-lg font-bold text-slate-900">Support & Engineering Inquiries</h3>
              <span className="text-xs text-slate-500 tabular-nums">
                {inquiries.length} Total
              </span>
            </div>

            {inquiries.length > 0 ? (
              <div className="divide-y divide-slate-200">
                {inquiries.map((inq) => (
                  <div key={inq.id} className="p-4 sm:p-6 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-sm text-slate-900">{inq.name}</span>
                          <span className="text-xs text-slate-500">({inq.email})</span>
                          <span
                            className={`text-[11px] font-semibold capitalize ${
                              inq.status === 'new' ? 'text-blue-700' : 'text-emerald-700'
                            }`}
                          >
                            · {inq.status}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 tabular-nums mt-0.5">
                          Submitted {inq.createdAt}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {onUpdateInquiryStatus && (
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateInquiryStatus(inq.id, inq.status === 'new' ? 'resolved' : 'new')
                            }
                            className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-700 transition-colors"
                          >
                            {inq.status === 'new' ? 'Mark Resolved' : 'Reopen'}
                          </button>
                        )}
                        {onDeleteInquiry && (
                          <button
                            type="button"
                            onClick={() => onDeleteInquiry(inq.id)}
                            aria-label={`Delete inquiry from ${inq.name}`}
                            className="min-h-[36px] min-w-[36px] flex items-center justify-center p-1.5 rounded-lg bg-slate-50 hover:bg-red-50 border border-slate-200 text-red-600 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {inq.message}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-14 px-4">
                <Mail className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <h4 className="text-sm font-bold text-slate-900 mb-1">No Support Inquiries Yet</h4>
                <p className="text-xs text-slate-500">
                  Messages submitted from the Contact page will appear here for review.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete Design Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div role="dialog" aria-modal="true" className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-5 sm:p-6 shadow-xl max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <div className="flex items-center gap-3 text-red-600 mb-3">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <h3 className="text-lg font-bold text-slate-900">Delete CAD Design?</h3>
            </div>
            <p className="text-xs text-slate-600 mb-6 leading-relaxed">
              Are you sure you want to delete this design? This action is permanent and will remove it from the public library immediately.
            </p>
            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="w-full sm:w-auto min-h-[44px] sm:min-h-0 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 px-4 py-2 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteDesign(deleteConfirmId);
                  setDeleteConfirmId(null);
                }}
                className="w-full sm:w-auto min-h-[44px] sm:min-h-0 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-xs font-semibold"
              >
                Yes, Delete Design
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Dashboard Confirmation Modal */}
      {resetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-dashboard-title"
            className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-5 sm:p-6 shadow-xl max-h-[calc(100dvh-2rem)] overflow-y-auto"
          >
            <div className="flex items-center gap-3 text-amber-600 mb-3">
              <RotateCcw className="w-6 h-6 shrink-0" />
              <h3 id="reset-dashboard-title" className="text-lg font-bold text-slate-900">
                Reset Admin Dashboard?
              </h3>
            </div>
            <p className="text-xs text-slate-600 mb-6 leading-relaxed">
              This will clear all uploaded CAD designs, restore the default engineering categories, reset download counts and user activity, and return the dashboard to its default state.
            </p>
            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5">
              <button
                type="button"
                disabled={resetting}
                onClick={() => setResetModalOpen(false)}
                className="w-full sm:w-auto min-h-[44px] sm:min-h-0 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={resetting}
                onClick={handleConfirmReset}
                className="w-full sm:w-auto min-h-[44px] sm:min-h-0 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-60"
              >
                {resetting ? 'Resetting...' : 'Yes, Reset Dashboard'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
