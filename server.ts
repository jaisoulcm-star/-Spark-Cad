import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { CADDesign, Category, ContactMessage, DesignReview, User } from './src/types.ts';
import {
  buildDownloadableCadFile,
  createResetPlatformState,
  filterAndSortDesigns,
  isValidEmail,
  recalculateDesignRating,
  reorderDesignsByIds,
  sanitizePreviewUrl,
  slugifyCategory,
  validateDesignPayload,
} from './src/utils/cadHelpers.ts';
import {
  hashPassword,
  signSessionToken,
  timingSafeCompareSecret,
  verifyPasswordHash,
  verifySessionToken,
} from './src/utils/authHelpers.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface StoredUser extends User {
  passwordHash?: string;
}

const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.resolve(DATA_DIR, 'uploads');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const SESSION_SECRET =
  (process.env.SESSION_SECRET || '').trim() || crypto.randomBytes(32).toString('hex');
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@sparkcat.hub').trim();

const DESIGNS_FILE = path.join(DATA_DIR, 'designs.json');
const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');

function resolveUploadPath(designId: string): string | null {
  const safeId = path.basename(designId).replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeId) return null;
  const resolved = path.resolve(UPLOADS_DIR, safeId);
  if (!resolved.startsWith(UPLOADS_DIR + path.sep)) return null;
  return resolved;
}

function resolvePreviewPath(designId: string): string | null {
  const safeId = path.basename(designId).replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeId) return null;
  const resolved = path.resolve(UPLOADS_DIR, `preview-${safeId}`);
  if (!resolved.startsWith(UPLOADS_DIR + path.sep)) return null;
  return resolved;
}

function detectImageMimeType(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return 'image/png';
  }
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  // GIF: 47 49 46 38
  if (
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38
  ) {
    return 'image/gif';
  }
  // WebP: RIFF....WEBP
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

function savePreviewImage(designId: string, previewDataBase64: unknown): string | undefined {
  if (typeof previewDataBase64 !== 'string' || !previewDataBase64.trim()) return undefined;
  const cleanB64 = previewDataBase64.includes(',')
    ? previewDataBase64.split(',').pop() || ''
    : previewDataBase64;
  if (!cleanB64) return undefined;
  try {
    const buf = Buffer.from(cleanB64, 'base64');
    if (buf.length === 0 || buf.length > 5 * 1024 * 1024) return undefined;
    if (!detectImageMimeType(buf)) return undefined;
    const target = resolvePreviewPath(designId);
    if (!target) return undefined;
    fs.writeFileSync(target, buf);
    return `/api/designs/${designId}/preview?v=${Date.now()}`;
  } catch (err) {
    console.error('Error saving preview image:', err);
    return undefined;
  }
}

function sanitizeOriginalFilename(name: unknown): string | undefined {
  if (typeof name !== 'string' || !name.trim()) return undefined;
  return path.basename(name.trim()).replace(/[^a-zA-Z0-9._-]/g, '_');
}

function saveUploadedFile(designId: string, fileDataBase64: unknown, originalFilename: unknown): string | undefined {
  if (typeof fileDataBase64 !== 'string' || !fileDataBase64.trim()) return undefined;
  const cleanB64 = fileDataBase64.includes(',') ? fileDataBase64.split(',').pop() || '' : fileDataBase64;
  if (!cleanB64) return undefined;
  try {
    const buf = Buffer.from(cleanB64, 'base64');
    if (buf.length === 0) return undefined;
    const target = resolveUploadPath(designId);
    if (!target) return undefined;
    fs.writeFileSync(target, buf);
    return sanitizeOriginalFilename(originalFilename);
  } catch (err) {
    console.error('Error saving uploaded CAD file:', err);
    return undefined;
  }
}

function removeUploadedFile(designId: string): void {
  const target = resolveUploadPath(designId);
  if (target) {
    try {
      if (fs.existsSync(target)) fs.unlinkSync(target);
    } catch (err) {
      console.error('Error removing uploaded CAD file:', err);
    }
  }
  const previewTarget = resolvePreviewPath(designId);
  if (previewTarget) {
    try {
      if (fs.existsSync(previewTarget)) fs.unlinkSync(previewTarget);
    } catch (err) {
      console.error('Error removing uploaded preview image:', err);
    }
  }
}

function clearAllUploadedFiles(): void {
  try {
    if (!fs.existsSync(UPLOADS_DIR)) return;
    for (const entry of fs.readdirSync(UPLOADS_DIR)) {
      const target = path.resolve(UPLOADS_DIR, entry);
      if (target.startsWith(UPLOADS_DIR + path.sep)) {
        fs.unlinkSync(target);
      }
    }
  } catch (err) {
    console.error('Error clearing uploaded CAD files:', err);
  }
}

// Initial Seed Data
const initialCategories: Category[] = [
  { id: '1', name: 'Electrical Engineering', slug: 'electrical', description: 'Power distribution, schematics, control panels, and wiring diagrams.', iconName: 'Zap' },
  { id: '2', name: 'Mechanical CAD', slug: 'mechanical', description: 'Machine parts, assemblies, gears, and pneumatic systems.', iconName: 'Cog' },
  { id: '3', name: 'Industrial Automation', slug: 'automation', description: 'PLC layouts, robotics, sensor arrays, and automation cells.', iconName: 'Cpu' },
  { id: '4', name: 'Architectural & MEP', slug: 'architectural', description: 'Building floor plans, HVAC ducting, plumbing, and electrical layouts.', iconName: 'Building' },
  { id: '5', name: 'Solar & Renewable', slug: 'solar', description: 'Photovoltaic layouts, string inverter schematics, and mounting racks.', iconName: 'Sun' },
];

export const initialDesigns: CADDesign[] = [];

const initialUsers: StoredUser[] = [
  {
    id: 'usr-admin',
    name: 'Spark Cat Admin',
    email: ADMIN_EMAIL,
    role: 'admin',
    favorites: [],
    downloadHistory: [],
    createdAt: '2026-10-01'
  },
  {
    id: 'usr-engineer',
    name: 'Alex Mercer (Lead Engineer)',
    email: 'alex@engineering.io',
    role: 'user',
    favorites: [],
    downloadHistory: [],
    createdAt: '2026-10-15'
  }
];

function sanitizeUser(u: StoredUser): User {
  const { passwordHash: _ignored, ...safe } = u;
  return safe;
}

// Helper to read/write JSON files
function readJSON<T>(file: string, fallback: T): T {
  try {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error(`Error reading ${file}:`, err);
  }
  return fallback;
}

function writeJSON<T>(file: string, data: T): void {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`Error writing ${file}:`, err);
  }
}

// Initialize files only if missing (never wipe existing designs on startup)
if (!fs.existsSync(DESIGNS_FILE)) {
  writeJSON(DESIGNS_FILE, initialDesigns);
}
if (!fs.existsSync(CATEGORIES_FILE)) {
  writeJSON(CATEGORIES_FILE, initialCategories);
}
if (!fs.existsSync(USERS_FILE)) {
  writeJSON(USERS_FILE, initialUsers);
}
if (!fs.existsSync(MESSAGES_FILE)) {
  writeJSON(MESSAGES_FILE, []);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  const extractBearerToken = (req: express.Request): string | null => {
    const authHeader = req.headers.authorization;
    if (!authHeader || typeof authHeader !== 'string') return null;
    if (!authHeader.startsWith('Bearer ')) return null;
    return authHeader.slice(7).trim() || null;
  };

  const getAuthenticatedUser = (req: express.Request): StoredUser | null => {
    const token = extractBearerToken(req);
    if (!token) return null;
    const payload = verifySessionToken(token, SESSION_SECRET);
    if (!payload) return null;
    const users = readJSON<StoredUser[]>(USERS_FILE, initialUsers);
    return users.find((u) => u.id === payload.userId && u.role === payload.role) || null;
  };

  const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const user = getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    (req as express.Request & { authUser?: StoredUser }).authUser = user;
    next();
  };

  const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const user = getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Administrator access required.' });
    }
    (req as express.Request & { authUser?: StoredUser }).authUser = user;
    next();
  };

  // 1. Get all designs with filters (drafts visible only to authenticated admins)
  app.get('/api/designs', (req, res) => {
    const designs = readJSON<CADDesign[]>(DESIGNS_FILE, initialDesigns);
    const { search, category, software, format, complexity, sort, status } = req.query;
    const caller = getAuthenticatedUser(req);
    const effectiveStatus =
      caller?.role === 'admin' && typeof status === 'string' ? status : 'published';

    const filtered = filterAndSortDesigns(designs, {
      search: typeof search === 'string' ? search : undefined,
      category: typeof category === 'string' ? category : undefined,
      software: typeof software === 'string' ? software : undefined,
      format: typeof format === 'string' ? format : undefined,
      complexity: typeof complexity === 'string' ? complexity : undefined,
      sort: typeof sort === 'string' ? sort : undefined,
      status: effectiveStatus,
    });

    res.json(filtered);
  });

  // 2. Get single design by ID
  app.get('/api/designs/:id', (req, res) => {
    const designs = readJSON<CADDesign[]>(DESIGNS_FILE, initialDesigns);
    const design = designs.find(d => d.id === req.params.id);
    if (!design) {
      return res.status(404).json({ error: 'Design not found' });
    }
    if (design.status !== 'published') {
      const caller = getAuthenticatedUser(req);
      if (caller?.role !== 'admin') {
        return res.status(404).json({ error: 'Design not found' });
      }
    }
    res.json(design);
  });

  // 2b. Serve real downloadable CAD file (uploaded file if stored, else generated CAD)
  app.get('/api/designs/:id/file', (req, res) => {
    const designs = readJSON<CADDesign[]>(DESIGNS_FILE, initialDesigns);
    const design = designs.find(d => d.id === req.params.id);
    if (!design) {
      return res.status(404).json({ error: 'Design not found' });
    }
    if (design.status !== 'published') {
      const caller = getAuthenticatedUser(req);
      if (caller?.role !== 'admin') {
        return res.status(404).json({ error: 'Design not found' });
      }
    }

    const storedPath = resolveUploadPath(design.id);
    if (storedPath && fs.existsSync(storedPath)) {
      const buffer = fs.readFileSync(storedPath);
      const fallback = buildDownloadableCadFile(design);
      const filename = sanitizeOriginalFilename(design.originalFilename) || fallback.filename;
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', String(buffer.length));
      return res.send(buffer);
    }

    const { filename, mimeType, buffer } = buildDownloadableCadFile(design);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.send(buffer);
  });

  // 2c. Serve uploaded custom preview image
  app.get('/api/designs/:id/preview', (req, res) => {
    const designs = readJSON<CADDesign[]>(DESIGNS_FILE, initialDesigns);
    const design = designs.find(d => d.id === req.params.id);
    if (!design) {
      return res.status(404).json({ error: 'Preview not found' });
    }
    if (design.status !== 'published') {
      const caller = getAuthenticatedUser(req);
      if (caller?.role !== 'admin') {
        return res.status(404).json({ error: 'Preview not found' });
      }
    }
    const previewPath = resolvePreviewPath(design.id);
    if (!previewPath || !fs.existsSync(previewPath)) {
      return res.status(404).json({ error: 'Preview not found' });
    }
    const buffer = fs.readFileSync(previewPath);
    const mime = detectImageMimeType(buffer);
    if (!mime) {
      return res.status(404).json({ error: 'Invalid preview image' });
    }
    res.setHeader('Content-Type', mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(buffer);
  });

  // 3. Create design (Admin)
  app.post('/api/designs', requireAdmin, (req, res) => {
    const validation = validateDesignPayload(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const designs = readJSON<CADDesign[]>(DESIGNS_FILE, initialDesigns);
    const id = `des-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const savedFilename = saveUploadedFile(id, req.body.fileDataBase64, req.body.originalFilename);
    const savedPreviewUrl = savePreviewImage(id, req.body.previewDataBase64);

    const newDesign: CADDesign = {
      id,
      title: req.body.title.trim(),
      description: req.body.description.trim(),
      category: req.body.category || 'Electrical Engineering',
      software: req.body.software || 'AutoCAD',
      format: req.body.format || 'DWG',
      complexity: req.body.complexity || 'Intermediate',
      fileSize: req.body.fileSize.trim(),
      previewUrl: savedPreviewUrl || sanitizePreviewUrl(req.body.previewUrl),
      downloadUrl: `/api/designs/${id}/file`,
      downloadsCount: 0,
      rating: 5.0,
      reviewsCount: 0,
      reviews: [],
      uploadedBy: req.body.uploadedBy || 'Spark Cat Admin',
      uploadedAt: new Date().toISOString().split('T')[0],
      status: req.body.status === 'draft' ? 'draft' : 'published',
      tags: Array.isArray(req.body.tags) ? req.body.tags : [],
      order: 0,
      ...(savedFilename ? { originalFilename: savedFilename } : {}),
    };

    const updated = [newDesign, ...designs].map((d, idx) => ({ ...d, order: idx }));
    writeJSON(DESIGNS_FILE, updated);
    res.status(201).json(newDesign);
  });

  // 3b. Batch upload designs via drag & drop (Admin)
  app.post('/api/designs/batch', requireAdmin, (req, res) => {
    const items = Array.isArray(req.body?.designs) ? req.body.designs : null;
    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'At least one CAD design is required.' });
    }

    for (let i = 0; i < items.length; i++) {
      const validation = validateDesignPayload(items[i]);
      if (!validation.valid) {
        return res.status(400).json({ error: `Item #${i + 1}: ${validation.error}` });
      }
    }

    const designs = readJSON<CADDesign[]>(DESIGNS_FILE, initialDesigns);
    const baseTime = Date.now();
    const today = new Date().toISOString().split('T')[0];

    const created: CADDesign[] = items.map((item: Record<string, unknown>, idx: number) => {
      const id = `des-${baseTime}-${idx}`;
      const savedFilename = saveUploadedFile(id, item.fileDataBase64, item.originalFilename);
      return {
        id,
        title: String(item.title).trim(),
        description: String(item.description).trim(),
        category: typeof item.category === 'string' && item.category ? item.category : 'Electrical Engineering',
        software: (item.software as CADDesign['software']) || 'AutoCAD',
        format: (item.format as CADDesign['format']) || 'DWG',
        complexity: (item.complexity as CADDesign['complexity']) || 'Intermediate',
        fileSize: String(item.fileSize).trim(),
        previewUrl: sanitizePreviewUrl(item.previewUrl),
        downloadUrl: `/api/designs/${id}/file`,
        downloadsCount: 0,
        rating: 5.0,
        reviewsCount: 0,
        reviews: [],
        uploadedBy: typeof item.uploadedBy === 'string' && item.uploadedBy ? item.uploadedBy : 'Spark Cat Admin',
        uploadedAt: today,
        status: item.status === 'draft' ? 'draft' : 'published',
        tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
        order: idx,
        ...(savedFilename ? { originalFilename: savedFilename } : {}),
      };
    });

    const updated = [...created, ...designs].map((d, idx) => ({ ...d, order: idx }));
    writeJSON(DESIGNS_FILE, updated);
    res.status(201).json({ success: true, created });
  });

  // 4a. Reorder designs via drag & drop (Admin) - must precede :id route
  app.put('/api/designs/reorder', requireAdmin, (req, res) => {
    const orderedIds = Array.isArray(req.body?.orderedIds)
      ? req.body.orderedIds.filter((id: unknown): id is string => typeof id === 'string')
      : null;

    if (!orderedIds) {
      return res.status(400).json({ error: 'orderedIds array is required.' });
    }

    const designs = readJSON<CADDesign[]>(DESIGNS_FILE, initialDesigns);
    const reordered = reorderDesignsByIds(designs, orderedIds);
    writeJSON(DESIGNS_FILE, reordered);
    res.json({ success: true, designs: reordered });
  });

  // 4. Update design (Admin)
  app.put('/api/designs/:id', requireAdmin, (req, res) => {
    const designs = readJSON<CADDesign[]>(DESIGNS_FILE, initialDesigns);
    const index = designs.findIndex(d => d.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Design not found' });
    }

    const body = req.body || {};
    const savedFilename = saveUploadedFile(designs[index].id, body.fileDataBase64, body.originalFilename);
    const savedPreviewUrl = savePreviewImage(designs[index].id, body.previewDataBase64);
    const current = designs[index];

    const merged: CADDesign = {
      ...current,
      title: typeof body.title === 'string' ? body.title.trim() : current.title,
      description: typeof body.description === 'string' ? body.description.trim() : current.description,
      category: typeof body.category === 'string' && body.category.trim() ? body.category.trim() : current.category,
      software: typeof body.software === 'string' && body.software ? (body.software as CADDesign['software']) : current.software,
      format: typeof body.format === 'string' && body.format ? (body.format as CADDesign['format']) : current.format,
      complexity: typeof body.complexity === 'string' && body.complexity ? (body.complexity as CADDesign['complexity']) : current.complexity,
      fileSize: typeof body.fileSize === 'string' ? body.fileSize.trim() : current.fileSize,
      previewUrl:
        savedPreviewUrl ||
        (typeof body.previewUrl === 'string' && body.previewUrl.trim()
          ? sanitizePreviewUrl(body.previewUrl)
          : current.previewUrl),
      status: body.status === 'draft' || body.status === 'published' ? body.status : current.status,
      tags: Array.isArray(body.tags) ? body.tags.map((t: unknown) => String(t).trim()).filter(Boolean) : current.tags,
      uploadedBy: typeof body.uploadedBy === 'string' && body.uploadedBy.trim() ? body.uploadedBy.trim() : current.uploadedBy,
      id: current.id,
      downloadUrl: `/api/designs/${current.id}/file`,
      ...(savedFilename ? { originalFilename: savedFilename } : {}),
    };

    const validation = validateDesignPayload(merged);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    designs[index] = merged;
    writeJSON(DESIGNS_FILE, designs);
    res.json(designs[index]);
  });

  // 5. Delete design (Admin)
  app.delete('/api/designs/:id', requireAdmin, (req, res) => {
    let designs = readJSON<CADDesign[]>(DESIGNS_FILE, initialDesigns);
    const initialLen = designs.length;
    designs = designs.filter(d => d.id !== req.params.id);
    if (designs.length === initialLen) {
      return res.status(404).json({ error: 'Design not found' });
    }
    removeUploadedFile(req.params.id);
    writeJSON(DESIGNS_FILE, designs.map((d, idx) => ({ ...d, order: idx })));

    const users = readJSON<StoredUser[]>(USERS_FILE, initialUsers);
    let usersModified = false;
    for (const user of users) {
      const nextFavs = user.favorites.filter((fid) => fid !== req.params.id);
      if (nextFavs.length !== user.favorites.length) {
        user.favorites = nextFavs;
        usersModified = true;
      }
    }
    if (usersModified) {
      writeJSON(USERS_FILE, users);
    }

    res.json({ success: true, message: 'Design deleted successfully' });
  });

  // 6. Track download
  app.post('/api/designs/:id/download', (req, res) => {
    const designs = readJSON<CADDesign[]>(DESIGNS_FILE, initialDesigns);
    const design = designs.find(d => d.id === req.params.id);
    if (!design) {
      return res.status(404).json({ error: 'Design not found' });
    }
    const caller = getAuthenticatedUser(req);
    if (design.status !== 'published' && caller?.role !== 'admin') {
      return res.status(404).json({ error: 'Design not found' });
    }
    design.downloadsCount += 1;
    writeJSON(DESIGNS_FILE, designs);

    if (caller) {
      const users = readJSON<StoredUser[]>(USERS_FILE, initialUsers);
      const user = users.find(u => u.id === caller.id);
      if (user) {
        user.downloadHistory.unshift({ designId: design.id, downloadedAt: new Date().toISOString().split('T')[0] });
        writeJSON(USERS_FILE, users);
      }
    }

    res.json({
      success: true,
      downloadsCount: design.downloadsCount,
      downloadUrl: `/api/designs/${design.id}/file`
    });
  });

  // 6b. Submit or update a rating & review on a design (Authenticated)
  app.post('/api/designs/:id/reviews', requireAuth, (req, res) => {
    const caller = (req as express.Request & { authUser?: StoredUser }).authUser;
    if (!caller) return res.status(401).json({ error: 'Authentication required.' });

    const rawRating = Number(req.body?.rating);
    const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim() : '';
    if (!Number.isInteger(rawRating) || rawRating < 1 || rawRating > 5) {
      return res.status(400).json({ error: 'Rating must be an integer between 1 and 5.' });
    }
    if (!comment || comment.length > 1000) {
      return res.status(400).json({ error: 'Review comment must be between 1 and 1000 characters.' });
    }

    const designs = readJSON<CADDesign[]>(DESIGNS_FILE, initialDesigns);
    const design = designs.find(d => d.id === req.params.id);
    if (!design || (design.status !== 'published' && caller.role !== 'admin')) {
      return res.status(404).json({ error: 'Design not found.' });
    }

    const existingReviews: DesignReview[] = Array.isArray(design.reviews) ? [...design.reviews] : [];
    const existingIdx = existingReviews.findIndex(r => r.userId === caller.id);
    const reviewEntry: DesignReview = {
      id: existingIdx !== -1 ? existingReviews[existingIdx].id : `rev-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      userId: caller.id,
      userName: caller.name,
      rating: rawRating,
      comment,
      createdAt: new Date().toISOString().split('T')[0],
    };

    if (existingIdx !== -1) {
      existingReviews[existingIdx] = reviewEntry;
    } else {
      existingReviews.unshift(reviewEntry);
    }

    const stats = recalculateDesignRating(existingReviews);
    design.reviews = existingReviews;
    design.rating = stats.rating;
    design.reviewsCount = stats.reviewsCount;
    writeJSON(DESIGNS_FILE, designs);
    res.status(201).json({ success: true, design });
  });

  // 6c. Delete a review (Review Author or Admin)
  app.delete('/api/designs/:id/reviews/:reviewId', requireAuth, (req, res) => {
    const caller = (req as express.Request & { authUser?: StoredUser }).authUser;
    if (!caller) return res.status(401).json({ error: 'Authentication required.' });

    const designs = readJSON<CADDesign[]>(DESIGNS_FILE, initialDesigns);
    const design = designs.find(d => d.id === req.params.id);
    if (!design) {
      return res.status(404).json({ error: 'Design not found.' });
    }

    const existingReviews: DesignReview[] = Array.isArray(design.reviews) ? [...design.reviews] : [];
    const target = existingReviews.find(r => r.id === req.params.reviewId);
    if (!target) {
      return res.status(404).json({ error: 'Review not found.' });
    }
    if (target.userId !== caller.id && caller.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to remove this review.' });
    }

    const nextReviews = existingReviews.filter(r => r.id !== req.params.reviewId);
    const stats = recalculateDesignRating(nextReviews);
    design.reviews = nextReviews;
    design.rating = stats.rating;
    design.reviewsCount = stats.reviewsCount;
    writeJSON(DESIGNS_FILE, designs);
    res.json({ success: true, design });
  });

  // 7. Get categories
  app.get('/api/categories', (req, res) => {
    const categories = readJSON<Category[]>(CATEGORIES_FILE, initialCategories);
    const designs = readJSON<CADDesign[]>(DESIGNS_FILE, initialDesigns);

    const categoriesWithCount = categories.map(cat => ({
      ...cat,
      count: designs.filter(d => d.category === cat.name && d.status === 'published').length
    }));

    res.json(categoriesWithCount);
  });

  // 8. Create Category (Admin)
  app.post('/api/categories', requireAdmin, (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
    if (!name) {
      return res.status(400).json({ error: 'Category name is required.' });
    }

    const categories = readJSON<Category[]>(CATEGORIES_FILE, initialCategories);
    if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      return res.status(400).json({ error: 'A category with that name already exists.' });
    }

    const newCat: Category = {
      id: 'cat-' + Date.now(),
      name,
      slug: slugifyCategory(name) || 'category-' + Date.now(),
      description: description || `Engineering CAD designs and schematics for ${name}.`,
      iconName: typeof req.body?.iconName === 'string' ? req.body.iconName : 'Zap',
      count: 0,
    };
    categories.push(newCat);
    writeJSON(CATEGORIES_FILE, categories);
    res.status(201).json(newCat);
  });

  // 8b. Update Category (Admin)
  app.put('/api/categories/:id', requireAdmin, (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
    if (!name) {
      return res.status(400).json({ error: 'Category name is required.' });
    }

    const categories = readJSON<Category[]>(CATEGORIES_FILE, initialCategories);
    const idx = categories.findIndex(c => c.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Category not found.' });
    }
    if (categories.some((c, i) => i !== idx && c.name.toLowerCase() === name.toLowerCase())) {
      return res.status(400).json({ error: 'Another category with that name already exists.' });
    }

    const previousName = categories[idx].name;
    categories[idx] = {
      ...categories[idx],
      name,
      slug: slugifyCategory(name) || categories[idx].slug,
      description: description || categories[idx].description,
    };
    writeJSON(CATEGORIES_FILE, categories);

    if (previousName !== name) {
      const designs = readJSON<CADDesign[]>(DESIGNS_FILE, initialDesigns);
      let changed = false;
      for (const d of designs) {
        if (d.category === previousName) {
          d.category = name;
          changed = true;
        }
      }
      if (changed) writeJSON(DESIGNS_FILE, designs);
    }

    res.json(categories[idx]);
  });

  // 8c. Delete Category (Admin)
  app.delete('/api/categories/:id', requireAdmin, (req, res) => {
    const categories = readJSON<Category[]>(CATEGORIES_FILE, initialCategories);
    if (categories.length <= 1) {
      return res.status(400).json({ error: 'At least one category must remain on the platform.' });
    }
    const target = categories.find(c => c.id === req.params.id);
    if (!target) {
      return res.status(404).json({ error: 'Category not found.' });
    }

    const remaining = categories.filter(c => c.id !== req.params.id);
    writeJSON(CATEGORIES_FILE, remaining);

    const fallbackCategory = remaining[0].name;
    const designs = readJSON<CADDesign[]>(DESIGNS_FILE, initialDesigns);
    let changed = false;
    for (const d of designs) {
      if (d.category === target.name) {
        d.category = fallbackCategory;
        changed = true;
      }
    }
    if (changed) writeJSON(DESIGNS_FILE, designs);

    res.json({ success: true, fallbackCategory });
  });

  // 9. Get users (Admin)
  app.get('/api/users', requireAdmin, (req, res) => {
    const users = readJSON<StoredUser[]>(USERS_FILE, initialUsers);
    res.json(users.map(sanitizeUser));
  });

  // 9b. Update user role (Admin)
  app.patch('/api/users/:id/role', requireAdmin, (req, res) => {
    const caller = (req as express.Request & { authUser?: StoredUser }).authUser;
    const nextRole = req.body?.role;
    if (nextRole !== 'admin' && nextRole !== 'user') {
      return res.status(400).json({ error: 'Role must be "admin" or "user".' });
    }
    const users = readJSON<StoredUser[]>(USERS_FILE, initialUsers);
    const idx = users.findIndex(u => u.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: 'User not found.' });
    }
    if (caller && users[idx].id === caller.id && nextRole !== 'admin') {
      return res.status(400).json({ error: 'You cannot demote your own administrator account.' });
    }
    if (users[idx].role === 'admin' && nextRole === 'user') {
      const adminCount = users.filter(u => u.role === 'admin').length;
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'At least one administrator account must remain.' });
      }
    }
    users[idx] = { ...users[idx], role: nextRole };
    writeJSON(USERS_FILE, users);
    res.json({ success: true, user: sanitizeUser(users[idx]) });
  });

  // 9c. Clear Authenticated User Download History (registered before /api/users/:id)
  app.delete('/api/users/downloads', requireAuth, (req, res) => {
    const caller = (req as express.Request & { authUser?: StoredUser }).authUser;
    if (!caller) return res.status(401).json({ error: 'Authentication required.' });
    const users = readJSON<StoredUser[]>(USERS_FILE, initialUsers);
    const user = users.find(u => u.id === caller.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    user.downloadHistory = [];
    writeJSON(USERS_FILE, users);
    res.json({ success: true, user: sanitizeUser(user) });
  });

  // 9d. Delete user account (Admin)
  app.delete('/api/users/:id', requireAdmin, (req, res) => {
    const caller = (req as express.Request & { authUser?: StoredUser }).authUser;
    const users = readJSON<StoredUser[]>(USERS_FILE, initialUsers);
    const target = users.find(u => u.id === req.params.id);
    if (!target) {
      return res.status(404).json({ error: 'User not found.' });
    }
    if (caller && target.id === caller.id) {
      return res.status(400).json({ error: 'You cannot delete your own active account.' });
    }
    if (target.role === 'admin' && users.filter(u => u.role === 'admin').length <= 1) {
      return res.status(400).json({ error: 'Cannot delete the sole administrator account.' });
    }
    const remaining = users.filter(u => u.id !== req.params.id);
    writeJSON(USERS_FILE, remaining);
    res.json({ success: true });
  });

  // 10a. Check first-run admin setup status (no secrets exposed)
  app.get('/api/auth/admin-status', (_req, res) => {
    const envPass = (process.env.ADMIN_PASSWORD || '').trim();
    const users = readJSON<StoredUser[]>(USERS_FILE, initialUsers);
    const adminUser = users.find((u) => u.role === 'admin');
    const needsSetup = !envPass && !adminUser?.passwordHash;
    res.json({
      needsSetup,
      adminEmail: adminUser?.email || ADMIN_EMAIL,
    });
  });

  // 10aa. Restore authenticated user session
  app.get('/api/auth/me', requireAuth, (req, res) => {
    const caller = (req as express.Request & { authUser?: StoredUser }).authUser;
    if (!caller) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    res.json({ success: true, user: sanitizeUser(caller) });
  });

  // 10b. First-run admin password claim (locked once claimed or if ADMIN_PASSWORD env is configured)
  app.post('/api/auth/setup-admin', (req, res) => {
    const envPass = (process.env.ADMIN_PASSWORD || '').trim();
    const users = readJSON<StoredUser[]>(USERS_FILE, initialUsers);
    const adminIndex = users.findIndex((u) => u.role === 'admin');
    if (envPass || (adminIndex !== -1 && users[adminIndex].passwordHash)) {
      return res.status(403).json({ error: 'Admin password is already configured.' });
    }

    const { email, password } = req.body || {};
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Admin password must be at least 8 characters.' });
    }

    const targetEmail =
      typeof email === 'string' && isValidEmail(email) ? email.trim() : ADMIN_EMAIL;

    const adminUser: StoredUser =
      adminIndex !== -1
        ? {
            ...users[adminIndex],
            email: targetEmail,
            passwordHash: hashPassword(password),
          }
        : {
            id: 'usr-admin',
            name: 'Spark Cat Admin',
            email: targetEmail,
            role: 'admin',
            favorites: [],
            downloadHistory: [],
            createdAt: new Date().toISOString().split('T')[0],
            passwordHash: hashPassword(password),
          };

    if (adminIndex !== -1) {
      users[adminIndex] = adminUser;
    } else {
      users.unshift(adminUser);
    }

    writeJSON(USERS_FILE, users);
    const token = signSessionToken({ userId: adminUser.id, role: adminUser.role }, SESSION_SECRET);
    res.status(201).json({ success: true, user: sanitizeUser(adminUser), token });
  });

  // 10. Auth: Login
  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const users = readJSON<StoredUser[]>(USERS_FILE, initialUsers);
    const normalizedInputEmail = email.trim().toLowerCase();
    const user = users.find((u) => u.email.toLowerCase() === normalizedInputEmail);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    let passwordValid = false;
    if (user.role === 'admin') {
      const envAdminPass = (process.env.ADMIN_PASSWORD || '').trim();
      if (envAdminPass) {
        passwordValid = timingSafeCompareSecret(password, envAdminPass);
      } else if (user.passwordHash) {
        passwordValid = verifyPasswordHash(password, user.passwordHash);
      }
    } else if (user.passwordHash) {
      passwordValid = verifyPasswordHash(password, user.passwordHash);
    } else {
      // Non-admin Demo Engineer account only
      passwordValid = ['demo123', 'user123'].includes(password);
    }

    if (!passwordValid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = signSessionToken({ userId: user.id, role: user.role }, SESSION_SECRET);
    res.json({ success: true, user: sanitizeUser(user), token });
  });

  // 11. Auth: Register
  app.post('/api/auth/register', (req, res) => {
    const { name, email, password } = req.body || {};
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Full name is required.' });
    }
    if (typeof email !== 'string' || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const users = readJSON<StoredUser[]>(USERS_FILE, initialUsers);
    const normalizedEmail = email.trim().toLowerCase();
    if (users.some(u => u.email.toLowerCase() === normalizedEmail)) {
      return res.status(400).json({ error: 'Email is already registered.' });
    }

    const newUser: StoredUser = {
      id: 'usr-' + Date.now(),
      name: name.trim(),
      email: email.trim(),
      role: 'user',
      favorites: [],
      downloadHistory: [],
      createdAt: new Date().toISOString().split('T')[0],
      passwordHash: hashPassword(password),
    };

    users.push(newUser);
    writeJSON(USERS_FILE, users);
    const token = signSessionToken({ userId: newUser.id, role: newUser.role }, SESSION_SECRET);
    res.status(201).json({ success: true, user: sanitizeUser(newUser), token });
  });

  // 12. Toggle Favorite (Authenticated user only)
  app.post('/api/users/favorites', requireAuth, (req, res) => {
    const caller = (req as express.Request & { authUser?: StoredUser }).authUser;
    const { designId } = req.body || {};
    if (!caller || typeof designId !== 'string' || !designId.trim()) {
      return res.status(400).json({ error: 'designId is required.' });
    }
    const designs = readJSON<CADDesign[]>(DESIGNS_FILE, initialDesigns);
    const targetDesign = designs.find((d) => d.id === designId);
    if (!targetDesign || (targetDesign.status !== 'published' && caller.role !== 'admin')) {
      return res.status(404).json({ error: 'Design not found.' });
    }
    const users = readJSON<StoredUser[]>(USERS_FILE, initialUsers);
    const user = users.find(u => u.id === caller.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const favIndex = user.favorites.indexOf(designId);
    if (favIndex > -1) {
      user.favorites.splice(favIndex, 1);
    } else {
      user.favorites.push(designId);
    }

    writeJSON(USERS_FILE, users);
    res.json({ success: true, favorites: user.favorites });
  });

  // 12b. Update Authenticated User Profile (Name & Optional Password Change)
  app.put('/api/users/profile', requireAuth, (req, res) => {
    const caller = (req as express.Request & { authUser?: StoredUser }).authUser;
    if (!caller) return res.status(401).json({ error: 'Authentication required.' });

    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

    if (!name || name.length > 80) {
      return res.status(400).json({ error: 'Display name must be between 1 and 80 characters.' });
    }

    const users = readJSON<StoredUser[]>(USERS_FILE, initialUsers);
    const idx = users.findIndex(u => u.id === caller.id);
    if (idx === -1) return res.status(404).json({ error: 'User not found.' });

    const user = { ...users[idx], name };

    if (newPassword) {
      if (newPassword.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters.' });
      }
      if (user.role === 'admin') {
        const envAdminPass = (process.env.ADMIN_PASSWORD || '').trim();
        if (envAdminPass) {
          return res.status(400).json({ error: 'Admin password is managed by environment secrets.' });
        }
        if (user.passwordHash && !verifyPasswordHash(currentPassword, user.passwordHash)) {
          return res.status(400).json({ error: 'Current password is incorrect.' });
        }
      } else if (user.passwordHash) {
        if (!verifyPasswordHash(currentPassword, user.passwordHash)) {
          return res.status(400).json({ error: 'Current password is incorrect.' });
        }
      } else if (!['demo123', 'user123'].includes(currentPassword)) {
        return res.status(400).json({ error: 'Current password is incorrect.' });
      }
      user.passwordHash = hashPassword(newPassword);
    }

    users[idx] = user;
    writeJSON(USERS_FILE, users);
    res.json({ success: true, user: sanitizeUser(user) });
  });

  // 13. Platform Statistics
  app.get('/api/stats', (req, res) => {
    const designs = readJSON<CADDesign[]>(DESIGNS_FILE, initialDesigns);
    const categories = readJSON<Category[]>(CATEGORIES_FILE, initialCategories);
    const users = readJSON<StoredUser[]>(USERS_FILE, initialUsers);

    const publishedDesigns = designs.filter(d => d.status === 'published');
    const totalDownloads = publishedDesigns.reduce((acc, d) => acc + d.downloadsCount, 0);

    res.json({
      totalDesigns: publishedDesigns.length,
      totalDownloads,
      totalCategories: categories.length,
      totalUsers: users.length
    });
  });

  // 14. Contact Support Inquiries (Public Submit + Admin Management)
  app.post('/api/contact', (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';

    if (!name || name.length > 100) {
      return res.status(400).json({ error: 'Please enter your name.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (message.length < 5 || message.length > 2000) {
      return res.status(400).json({ error: 'Message must be between 5 and 2000 characters.' });
    }

    const messages = readJSON<ContactMessage[]>(MESSAGES_FILE, []);
    const newMessage: ContactMessage = {
      id: `msg-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      name,
      email,
      message,
      status: 'new',
      createdAt: new Date().toISOString().split('T')[0],
    };
    messages.unshift(newMessage);
    writeJSON(MESSAGES_FILE, messages);
    res.status(201).json({ success: true, inquiry: newMessage });
  });

  app.get('/api/contact', requireAdmin, (_req, res) => {
    const messages = readJSON<ContactMessage[]>(MESSAGES_FILE, []);
    res.json(messages);
  });

  app.patch('/api/contact/:id', requireAdmin, (req, res) => {
    const nextStatus = req.body?.status;
    if (nextStatus !== 'new' && nextStatus !== 'resolved') {
      return res.status(400).json({ error: 'Status must be "new" or "resolved".' });
    }
    const messages = readJSON<ContactMessage[]>(MESSAGES_FILE, []);
    const idx = messages.findIndex(m => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Inquiry not found.' });
    messages[idx] = { ...messages[idx], status: nextStatus };
    writeJSON(MESSAGES_FILE, messages);
    res.json({ success: true, inquiry: messages[idx] });
  });

  app.delete('/api/contact/:id', requireAdmin, (req, res) => {
    const messages = readJSON<ContactMessage[]>(MESSAGES_FILE, []);
    const remaining = messages.filter(m => m.id !== req.params.id);
    if (remaining.length === messages.length) {
      return res.status(404).json({ error: 'Inquiry not found.' });
    }
    writeJSON(MESSAGES_FILE, remaining);
    res.json({ success: true });
  });

  // 14b. Newsletter Subscription
  app.post('/api/newsletter', (req, res) => {
    const { email } = req.body || {};
    if (typeof email !== 'string' || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    res.json({ success: true, message: 'Subscribed to Spark Cat Engineering updates!' });
  });

  // 15. Reset Admin Dashboard Data (Admin)
  app.post('/api/admin/reset', requireAdmin, (_req, res) => {
    const existingUsers = readJSON<StoredUser[]>(USERS_FILE, initialUsers);
    const existingAdmin = existingUsers.find((u) => u.role === 'admin');
    const seedUsers = initialUsers.map((u) =>
      u.role === 'admin' && existingAdmin
        ? {
            ...u,
            email: existingAdmin.email,
            name: existingAdmin.name,
            ...(existingAdmin.passwordHash ? { passwordHash: existingAdmin.passwordHash } : {}),
          }
        : u
    );

    const resetState = createResetPlatformState(initialCategories, seedUsers);
    clearAllUploadedFiles();
    writeJSON(DESIGNS_FILE, resetState.designs);
    writeJSON(CATEGORIES_FILE, resetState.categories);
    writeJSON(USERS_FILE, resetState.users);
    res.json({
      success: true,
      message: 'Admin Dashboard data reset to default state.',
    });
  });

  // Express error middleware for oversized payloads and invalid JSON
  app.use((err: { status?: number; type?: string; message?: string }, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err && (err.type === 'entity.too.large' || err.status === 413)) {
      return res.status(413).json({ error: 'Uploaded file payload is too large (max 50 MB total).' });
    }
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Invalid JSON request payload.' });
    }
    next(err);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    const imagesPath = path.resolve(__dirname, 'src', 'assets', 'images');
    app.use('/src/assets/images', express.static(imagesPath));
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  return app;
}

let cachedApp: express.Express | null = null;
let initPromise: Promise<express.Express> | null = null;

async function getApp(): Promise<express.Express> {
  if (cachedApp) return cachedApp;
  if (!initPromise) {
    initPromise = startServer();
  }
  cachedApp = await initPromise;
  return cachedApp;
}

export default async function handler(req: any, res: any) {
  const app = await getApp();
  return app(req, res);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  getApp().then((app) => {
    const PORT = Number(process.env.PORT || 3000);
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Spark Cat CAD Hub server running on http://localhost:${PORT}`);
    });
  });
}
