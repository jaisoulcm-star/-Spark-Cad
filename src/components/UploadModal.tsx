import React, { useState, useEffect, useRef } from 'react';
import { CADDesign, Category } from '../types';
import { parseDroppedCadFileMeta } from '../utils/cadHelpers';
import { X, Upload, FileUp, Trash2, Image as ImageIcon } from 'lucide-react';

interface UploadDesignPayload extends Partial<CADDesign> {
  fileDataBase64?: string;
  originalFilename?: string;
  previewDataBase64?: string;
}

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  onSaveDesign: (designData: UploadDesignPayload) => Promise<boolean> | boolean;
  editingDesign?: CADDesign | null;
}

const DEFAULT_PREVIEW_URL = '/src/assets/images/cad_electrical_panel_1795206880418.jpg';

export function UploadModal({
  isOpen,
  onClose,
  categories,
  onSaveDesign,
  editingDesign
}: UploadModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Electrical Engineering');
  const [software, setSoftware] = useState<'AutoCAD' | 'EPLAN' | 'Revit' | 'SolidWorks' | 'Inventor' | 'Fusion 360'>('AutoCAD');
  const [format, setFormat] = useState<'DWG' | 'DXF' | 'PDF' | 'EPLAN' | 'ZIP'>('DWG');
  const [complexity, setComplexity] = useState<'Beginner' | 'Intermediate' | 'Advanced'>('Intermediate');
  const [fileSize, setFileSize] = useState('12.5 MB');
  const [previewUrl, setPreviewUrl] = useState(DEFAULT_PREVIEW_URL);
  const [tagsInput, setTagsInput] = useState('');
  const [status, setStatus] = useState<'published' | 'draft'>('published');
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [attachedFilename, setAttachedFilename] = useState<string>('');
  const [fileDataBase64, setFileDataBase64] = useState<string>('');
  const [previewDataBase64, setPreviewDataBase64] = useState<string>('');
  const [previewFilename, setPreviewFilename] = useState<string>('');
  const [readingFile, setReadingFile] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewInputRef = useRef<HTMLInputElement>(null);

  const defaultCategoryName = categories[0]?.name || 'Electrical Engineering';

  useEffect(() => {
    if (!isOpen) return;
    if (editingDesign) {
      setTitle(editingDesign.title);
      setDescription(editingDesign.description);
      setCategory(editingDesign.category);
      setSoftware(editingDesign.software);
      setFormat(editingDesign.format);
      setComplexity(editingDesign.complexity);
      setFileSize(editingDesign.fileSize);
      setPreviewUrl(editingDesign.previewUrl);
      setTagsInput(editingDesign.tags?.join(', ') || '');
      setStatus(editingDesign.status || 'published');
      setAttachedFilename(editingDesign.originalFilename || '');
      setFileDataBase64('');
      setPreviewDataBase64('');
      setPreviewFilename('');
      setReadingFile(false);
      setSaving(false);
    } else {
      setTitle('');
      setDescription('');
      setCategory(defaultCategoryName);
      setSoftware('AutoCAD');
      setFormat('DWG');
      setComplexity('Intermediate');
      setFileSize('10.2 MB');
      setPreviewUrl(DEFAULT_PREVIEW_URL);
      setTagsInput('CAD, Engineering, Schematic');
      setStatus('published');
      setAttachedFilename('');
      setFileDataBase64('');
      setPreviewDataBase64('');
      setPreviewFilename('');
      setReadingFile(false);
      setSaving(false);
    }
  }, [editingDesign?.id, isOpen]);

  if (!isOpen) return null;

  const handleAttachFile = (file: File) => {
    const meta = parseDroppedCadFileMeta(file.name, file.size);
    setAttachedFilename(file.name);
    setFileSize(meta.fileSize);
    setFormat(meta.format);
    if (!editingDesign) {
      if (!title.trim()) setTitle(meta.title);
      if (!description.trim()) setDescription(meta.description);
      setSoftware(meta.software);
      if (categories.some((c) => c.name === meta.category)) {
        setCategory(meta.category);
      }
      setPreviewUrl(meta.previewUrl);
      setTagsInput(meta.tags.join(', '));
    }

    setReadingFile(true);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setFileDataBase64(reader.result);
      }
      setReadingFile(false);
    };
    reader.onerror = () => {
      setReadingFile(false);
    };
    reader.readAsDataURL(file);
  };

  const handleAttachPreviewImage = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) return;
    setPreviewFilename(file.name);
    setReadingFile(true);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPreviewDataBase64(reader.result);
      }
      setReadingFile(false);
    };
    reader.onerror = () => {
      setReadingFile(false);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readingFile || saving) return;
    const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);

    setSaving(true);
    try {
      const ok = await onSaveDesign({
        id: editingDesign ? editingDesign.id : undefined,
        title,
        description,
        category,
        software,
        format,
        complexity,
        fileSize,
        previewUrl: previewUrl.trim() || DEFAULT_PREVIEW_URL,
        status,
        tags,
        ...(fileDataBase64 ? { fileDataBase64, originalFilename: attachedFilename } : {}),
        ...(previewDataBase64 ? { previewDataBase64 } : {}),
      });
      if (ok !== false) {
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-slate-900/40 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-modal-title"
        className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full p-5 sm:p-7 shadow-xl relative my-2 sm:my-8 max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)] overflow-y-auto"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close upload modal"
          className="absolute top-4 right-4 sm:top-5 sm:right-5 min-h-[40px] min-w-[40px] sm:min-h-0 sm:min-w-0 flex items-center justify-center text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 p-1.5 rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 id="upload-modal-title" className="text-lg sm:text-xl font-extrabold text-slate-900 mb-1 pr-10">
          {editingDesign ? 'Edit CAD Design' : 'Upload New CAD Design'}
        </h2>
        <p className="text-xs text-slate-500 mb-5 sm:mb-6">
          {editingDesign ? 'Update design details and specifications' : 'Publish verified CAD schematics to the public library'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Drag & Drop CAD File Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingFile(true);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setIsDraggingFile(false);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingFile(false);
              const file = e.dataTransfer.files?.[0];
              if (file) handleAttachFile(file);
            }}
            className={`rounded-lg border-2 border-dashed p-4 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              isDraggingFile
                ? 'border-blue-700 bg-blue-50'
                : 'border-slate-300 bg-slate-50 hover:border-slate-400'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".dwg,.dxf,.pdf,.eplan,.epj,.zw1,.zip"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleAttachFile(file);
                e.target.value = '';
              }}
            />
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-blue-700 shrink-0">
                <FileUp className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-900">
                  {attachedFilename ? `Attached: ${attachedFilename}` : 'Drag & drop CAD file here'}
                </div>
                <div className="text-[11px] text-slate-500">
                  {attachedFilename
                    ? `Size: ${fileSize} · Auto-filled metadata`
                    : 'Supports DWG, DXF, PDF, EPLAN, or ZIP packages'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
              {attachedFilename && (
                <button
                  type="button"
                  onClick={() => {
                    setAttachedFilename('');
                    setFileDataBase64('');
                  }}
                  aria-label="Remove attached CAD file"
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center p-2 rounded-lg bg-white border border-slate-200 hover:bg-red-50 hover:border-red-200 text-red-600 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 sm:flex-none min-h-[40px] justify-center bg-white hover:bg-slate-100 text-slate-800 text-xs font-semibold px-3.5 py-2 rounded-lg border border-slate-300 transition-colors inline-flex items-center"
              >
                Browse File
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="upload-title" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Design Title
            </label>
            <input
              id="upload-title"
              type="text"
              placeholder="e.g. 480V Industrial Motor Control Panel"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full bg-white text-slate-900 text-sm rounded-lg px-3.5 py-2.5 border border-slate-300 focus:outline-none focus:border-blue-700 focus:ring-1 focus:ring-blue-700 placeholder:text-slate-400"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="upload-category" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Category
              </label>
              <select
                id="upload-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-white text-slate-900 text-xs rounded-lg p-2.5 border border-slate-300 focus:outline-none focus:border-blue-700"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="upload-software" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Software
              </label>
              <select
                id="upload-software"
                value={software}
                onChange={(e) => setSoftware(e.target.value as CADDesign['software'])}
                className="w-full bg-white text-slate-900 text-xs rounded-lg p-2.5 border border-slate-300 focus:outline-none focus:border-blue-700"
              >
                <option value="AutoCAD">AutoCAD</option>
                <option value="EPLAN">EPLAN</option>
                <option value="Revit">Revit</option>
                <option value="SolidWorks">SolidWorks</option>
                <option value="Inventor">Inventor</option>
                <option value="Fusion 360">Fusion 360</option>
              </select>
            </div>

            <div>
              <label htmlFor="upload-format" className="block text-xs font-semibold text-slate-700 mb-1.5">
                File Format
              </label>
              <select
                id="upload-format"
                value={format}
                onChange={(e) => setFormat(e.target.value as CADDesign['format'])}
                className="w-full bg-white text-slate-900 text-xs rounded-lg p-2.5 border border-slate-300 focus:outline-none focus:border-blue-700"
              >
                <option value="DWG">DWG</option>
                <option value="DXF">DXF</option>
                <option value="PDF">PDF</option>
                <option value="EPLAN">EPLAN</option>
                <option value="ZIP">ZIP</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="upload-complexity" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Complexity
              </label>
              <select
                id="upload-complexity"
                value={complexity}
                onChange={(e) => setComplexity(e.target.value as CADDesign['complexity'])}
                className="w-full bg-white text-slate-900 text-xs rounded-lg p-2.5 border border-slate-300 focus:outline-none focus:border-blue-700"
              >
                <option value="Beginner">Beginner</option>
                <option value="Intermediate">Intermediate</option>
                <option value="Advanced">Advanced</option>
              </select>
            </div>

            <div>
              <label htmlFor="upload-filesize" className="block text-xs font-semibold text-slate-700 mb-1.5">
                File Size
              </label>
              <input
                id="upload-filesize"
                type="text"
                placeholder="e.g. 14.2 MB"
                value={fileSize}
                onChange={(e) => setFileSize(e.target.value)}
                required
                className="w-full bg-white text-slate-900 text-xs rounded-lg px-3.5 py-2.5 border border-slate-300 focus:outline-none focus:border-blue-700 font-mono"
              />
            </div>

            <div>
              <label htmlFor="upload-status" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Status
              </label>
              <select
                id="upload-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as CADDesign['status'])}
                className="w-full bg-white text-slate-900 text-xs rounded-lg p-2.5 border border-slate-300 focus:outline-none focus:border-blue-700"
              >
                <option value="published">Published (Public)</option>
                <option value="draft">Draft (Admin Only)</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="upload-preview" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Preview Image (Upload or URL)
            </label>
            <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
              <div className="w-16 h-12 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 shrink-0 flex items-center justify-center">
                <img
                  src={previewDataBase64 || previewUrl || DEFAULT_PREVIEW_URL}
                  alt="Preview thumbnail"
                  className="w-full h-full object-contain object-center"
                />
              </div>
              <input
                ref={previewInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleAttachPreviewImage(file);
                  e.target.value = '';
                }}
              />
              <input
                id="upload-preview"
                type="text"
                placeholder="/src/assets/images/..."
                value={previewDataBase64 ? `Uploaded: ${previewFilename}` : previewUrl}
                readOnly={Boolean(previewDataBase64)}
                onChange={(e) => setPreviewUrl(e.target.value)}
                className="flex-1 bg-white text-slate-900 text-xs rounded-lg px-3.5 py-2.5 border border-slate-300 focus:outline-none focus:border-blue-700 font-mono"
              />
              <div className="flex items-center gap-2 shrink-0">
                {previewDataBase64 && (
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewDataBase64('');
                      setPreviewFilename('');
                    }}
                    aria-label="Clear uploaded preview image"
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center p-2 rounded-lg bg-white border border-slate-200 hover:bg-red-50 text-red-600 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => previewInputRef.current?.click()}
                  className="flex-1 sm:flex-none min-h-[40px] px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-blue-700" />
                  <span>Upload Image</span>
                </button>
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="upload-desc" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Full Description
            </label>
            <textarea
              id="upload-desc"
              rows={3}
              placeholder="Describe technical features, schematic details, components..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              className="w-full bg-white text-slate-900 text-xs rounded-lg p-3.5 border border-slate-300 focus:outline-none focus:border-blue-700"
            />
          </div>

          <div>
            <label htmlFor="upload-tags" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Tags (comma separated)
            </label>
            <input
              id="upload-tags"
              type="text"
              placeholder="MCC, VFD, Motor Control, 3-Phase"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className="w-full bg-white text-slate-900 text-xs rounded-lg px-3.5 py-2.5 border border-slate-300 focus:outline-none focus:border-blue-700"
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 sm:gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto min-h-[44px] sm:min-h-0 justify-center bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs px-4 py-2.5 rounded-lg border border-slate-300 transition-colors inline-flex items-center"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={readingFile || saving}
              className="w-full sm:w-auto min-h-[44px] sm:min-h-0 justify-center bg-blue-700 hover:bg-blue-800 text-white font-semibold text-xs px-6 py-2.5 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-60"
            >
              <Upload className="w-4 h-4" />
              <span>
                {readingFile
                  ? 'Reading File...'
                  : saving
                  ? 'Saving...'
                  : editingDesign
                  ? 'Save Changes'
                  : 'Publish Design'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
