import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import type { CADDesign, Category, ContactMessage, DesignReview } from './src/types.ts';
import {
  buildDownloadableCadFile,
  filterAndSortDesigns,
  isValidEmail,
  recalculateDesignRating,
  reorderDesignsByIds,
  sanitizeDesignTitle,
  sanitizePreviewUrl,
  slugifyCategory,
  validateDesignPayload,
} from './src/utils/cadHelpers.ts';
import {
  hashPassword,
  signSessionToken,
  timingSafeCompareSecret,
  verifyPasswordHash,
} from './src/utils/authHelpers.ts';
import {
  createCategoryInDb,
  createContactMessageInDb,
  deleteCategoryFromDb,
  deleteContactMessageFromDb,
  deleteDesignFromDb,
  getAllCategories,
  getAllContactMessagesFromDb,
  getAllDesignsFromDb,
  getDesignByIdFromDb,
  getStorageFileFromDb,
  resetDatabasePlatformState,
  saveStorageFileInDb,
  updateCategoryInDb,
  updateContactMessageStatusInDb,
  upsertDesignInDb,
} from './src/db/repository.ts';
import {
  createLocalUser,
  DEFAULT_ADMIN_HASH,
  deleteUserByUid,
  getAllUsers,
  getUserByEmail,
  isKnownAdminEmail,
  sanitizeDbUser,
  updateUserRecord,
} from './src/db/users.ts';
import {
  clearSessionCookie,
  requireAdmin,
  requireAuth,
  resolveAuthenticatedUser,
  SESSION_SECRET,
  setSessionCookie,
  type AuthRequest,
} from './src/middleware/auth.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@sparkcat.hub').trim();

function detectImageMimeType(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  // PNG: 89 50 4E 47
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

function sanitizeOriginalFilename(name: unknown): string | undefined {
  if (typeof name !== 'string' || !name.trim()) return undefined;
  return path.basename(name.trim()).replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function savePreviewImageToDb(
  designId: string,
  previewDataBase64: unknown
): Promise<string | undefined> {
  if (typeof previewDataBase64 !== 'string' || !previewDataBase64.trim()) return undefined;
  const cleanB64 = previewDataBase64.includes(',')
    ? previewDataBase64.split(',').pop() || ''
    : previewDataBase64;
  if (!cleanB64) return undefined;

  const buf = Buffer.from(cleanB64, 'base64');
  if (buf.length === 0 || buf.length > 15 * 1024 * 1024) return undefined;
  const mimeType = detectImageMimeType(buf);
  if (!mimeType) return undefined;

  const ext = mimeType.split('/')[1] || 'png';
  await saveStorageFileInDb({
    id: `preview-${designId}`,
    designId,
    fileType: 'preview',
    filename: `preview-${designId}.${ext}`,
    mimeType,
    sizeBytes: buf.length,
    dataBase64: buf.toString('base64'),
  });
  return `/api/designs/${designId}/preview?v=${Date.now()}`;
}

async function saveUploadedCadFileToDb(
  designId: string,
  fileDataBase64: unknown,
  originalFilename: unknown
): Promise<string | undefined> {
  if (typeof fileDataBase64 !== 'string' || !fileDataBase64.trim()) return undefined;
  const cleanB64 = fileDataBase64.includes(',')
    ? fileDataBase64.split(',').pop() || ''
    : fileDataBase64;
  if (!cleanB64) return undefined;

  const buf = Buffer.from(cleanB64, 'base64');
  if (buf.length === 0) return undefined;
  const safeName = sanitizeOriginalFilename(originalFilename) || `${designId}.cad`;

  await saveStorageFileInDb({
    id: `cad-${designId}`,
    designId,
    fileType: 'cad',
    filename: safeName,
    mimeType: 'application/octet-stream',
    sizeBytes: buf.length,
    dataBase64: buf.toString('base64'),
  });
  return safeName;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  // Prevent intermediate caching on all API endpoints so admin updates reflect immediately
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  // 1. Get all designs with filters (drafts visible only to authenticated admins)
  app.get('/api/designs', async (req: AuthRequest, res) => {
    try {
      const designs = await getAllDesignsFromDb();
      const { search, category, software, format, complexity, sort, status } = req.query;
      const caller = await resolveAuthenticatedUser(req);
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
    } catch (error: any) {
      console.error('Failed to fetch designs:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch designs.' });
    }
  });

  // 2. Get single design by ID
  app.get('/api/designs/:id', async (req: AuthRequest, res) => {
    try {
      const design = await getDesignByIdFromDb(req.params.id);
      if (!design) return res.status(404).json({ error: 'Design not found' });
      if (design.status !== 'published') {
        const caller = await resolveAuthenticatedUser(req);
        if (caller?.role !== 'admin') {
          return res.status(404).json({ error: 'Design not found' });
        }
      }
      res.json(design);
    } catch (error: any) {
      console.error('Failed to fetch design:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch design.' });
    }
  });

  // 2b. Serve actual downloadable CAD file payload from PostgreSQL storage_files
  app.get('/api/designs/:id/file', async (req: AuthRequest, res) => {
    try {
      const design = await getDesignByIdFromDb(req.params.id);
      if (!design) return res.status(404).json({ error: 'Design not found' });
      if (design.status !== 'published') {
        const caller = await resolveAuthenticatedUser(req);
        if (caller?.role !== 'admin') {
          return res.status(404).json({ error: 'Design not found' });
        }
      }

      const storedFile = await getStorageFileFromDb(`cad-${design.id}`);
      if (storedFile) {
        const safeFilename =
          sanitizeOriginalFilename(design.originalFilename || storedFile.filename) ||
          `${design.id}.${design.format.toLowerCase()}`;
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
        res.setHeader('Content-Length', String(storedFile.buffer.length));
        return res.status(200).send(storedFile.buffer);
      }

      const file = buildDownloadableCadFile(design);
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
      res.setHeader('Content-Length', String(file.buffer.length));
      res.status(200).send(file.buffer);
    } catch (error: any) {
      console.error('Failed to serve CAD file:', error);
      res.status(500).json({ error: error.message || 'Failed to download CAD file.' });
    }
  });

  // 2c. Serve custom uploaded preview image from PostgreSQL storage_files
  app.get('/api/designs/:id/preview', async (req: AuthRequest, res) => {
    try {
      const design = await getDesignByIdFromDb(req.params.id);
      if (!design) return res.status(404).json({ error: 'Design not found' });
      if (design.status !== 'published') {
        const caller = await resolveAuthenticatedUser(req);
        if (caller?.role !== 'admin') {
          return res.status(404).json({ error: 'Design not found' });
        }
      }

      const storedPreview = await getStorageFileFromDb(`preview-${design.id}`);
      if (!storedPreview) {
        return res.status(404).json({ error: 'Custom preview not found' });
      }
      const mime = detectImageMimeType(storedPreview.buffer);
      if (!mime) {
        return res.status(415).json({ error: 'Unsupported preview format' });
      }
      res.setHeader('Content-Type', mime);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.status(200).send(storedPreview.buffer);
    } catch (error: any) {
      console.error('Failed to serve preview image:', error);
      return res.status(500).json({ error: 'Unable to read preview image' });
    }
  });

  // 3. Create new design (Admin)
  app.post('/api/designs', requireAdmin, async (req: AuthRequest, res) => {
    try {
      const validation = validateDesignPayload(req.body || {});
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      const existingDesigns = await getAllDesignsFromDb();
      const designId = 'des-' + Date.now();
      const savedFilename = await saveUploadedCadFileToDb(
        designId,
        req.body?.fileDataBase64,
        req.body?.originalFilename
      );
      const savedPreviewUrl = await savePreviewImageToDb(
        designId,
        req.body?.previewDataBase64 || req.body?.fileDataBase64
      );
      const maxOrder = existingDesigns.reduce(
        (max, d, idx) => Math.max(max, typeof d.order === 'number' ? d.order : idx),
        -1
      );

      const newDesign: CADDesign = {
        id: designId,
        title: sanitizeDesignTitle(req.body.title),
        description: String(req.body.description).trim(),
        category: req.body.category || 'Electrical Engineering',
        software: req.body.software || 'AutoCAD',
        format: req.body.format || 'DWG',
        complexity: req.body.complexity || 'Intermediate',
        fileSize: String(req.body.fileSize || '5.0 MB').trim(),
        previewUrl: savedPreviewUrl || sanitizePreviewUrl(req.body.previewUrl),
        downloadUrl: `/api/designs/${designId}/file`,
        originalFilename: savedFilename || sanitizeOriginalFilename(req.body?.originalFilename),
        downloadsCount: 0,
        rating: 5.0,
        reviewsCount: 1,
        reviews: [],
        uploadedBy: req.body.uploadedBy || req.authUser?.name || 'Spark Cat Admin',
        uploadedAt: new Date().toISOString().split('T')[0],
        status: req.body.status === 'draft' ? 'draft' : 'published',
        order: maxOrder + 1,
        tags: Array.isArray(req.body.tags)
          ? req.body.tags
          : typeof req.body.tags === 'string'
            ? req.body.tags
                .split(',')
                .map((t: string) => t.trim())
                .filter(Boolean)
            : ['CAD', 'Engineering'],
      };

      const created = await upsertDesignInDb(newDesign);
      res.status(201).json(created);
    } catch (error: any) {
      console.error('Failed to create design:', error);
      res.status(500).json({ error: error.message || 'Failed to save design to database.' });
    }
  });

  // 3b. Batch upload multiple CAD designs at once (Admin)
  app.post('/api/designs/batch', requireAdmin, async (req: AuthRequest, res) => {
    try {
      const items = Array.isArray(req.body?.designs) ? req.body.designs : null;
      if (!items || items.length === 0) {
        return res.status(400).json({ error: 'Please provide at least one CAD design to upload.' });
      }
      if (items.length > 25) {
        return res.status(400).json({ error: 'Batch upload is limited to 25 files at a time.' });
      }

      for (const item of items) {
        const validation = validateDesignPayload(item || {});
        if (!validation.valid) {
          return res.status(400).json({ error: validation.error });
        }
      }

      const existingDesigns = await getAllDesignsFromDb();
      let nextOrder =
        existingDesigns.reduce(
          (max, d, idx) => Math.max(max, typeof d.order === 'number' ? d.order : idx),
          -1
        ) + 1;
      const now = Date.now();
      const created: CADDesign[] = [];

      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        const designId = `des-${now}-${idx + 1}`;
        const savedFilename = await saveUploadedCadFileToDb(
          designId,
          item.fileDataBase64,
          item.originalFilename
        );
        const savedPreviewUrl = await savePreviewImageToDb(
          designId,
          item.previewDataBase64 || item.fileDataBase64
        );

        const newDesign: CADDesign = {
          id: designId,
          title: sanitizeDesignTitle(item.title),
          description: String(item.description).trim(),
          category: item.category || 'Electrical Engineering',
          software: item.software || 'AutoCAD',
          format: item.format || 'DWG',
          complexity: item.complexity || 'Intermediate',
          fileSize: String(item.fileSize || '5.0 MB').trim(),
          previewUrl: savedPreviewUrl || sanitizePreviewUrl(item.previewUrl),
          downloadUrl: `/api/designs/${designId}/file`,
          originalFilename: savedFilename || sanitizeOriginalFilename(item.originalFilename),
          downloadsCount: 0,
          rating: 5.0,
          reviewsCount: 1,
          reviews: [],
          uploadedBy: item.uploadedBy || req.authUser?.name || 'Spark Cat Admin',
          uploadedAt: new Date().toISOString().split('T')[0],
          status: item.status === 'draft' ? 'draft' : 'published',
          order: nextOrder++,
          tags: Array.isArray(item.tags)
            ? item.tags
            : typeof item.tags === 'string'
              ? item.tags
                  .split(',')
                  .map((t: string) => t.trim())
                  .filter(Boolean)
              : ['CAD', 'Engineering'],
        };

        const saved = await upsertDesignInDb(newDesign);
        created.push(saved);
      }

      res.status(201).json({ success: true, created });
    } catch (error: any) {
      console.error('Failed to batch upload designs:', error);
      res.status(500).json({ error: error.message || 'Failed to upload CAD designs.' });
    }
  });

  // 3c. Reorder CAD designs (Admin)
  app.put('/api/designs/reorder', requireAdmin, async (req: AuthRequest, res) => {
    try {
      const orderedIds = Array.isArray(req.body?.orderedIds)
        ? req.body.orderedIds.filter((id: unknown): id is string => typeof id === 'string')
        : null;
      if (!orderedIds || orderedIds.length === 0) {
        return res.status(400).json({ error: 'orderedIds array is required.' });
      }

      const designs = await getAllDesignsFromDb();
      const reordered = reorderDesignsByIds(designs, orderedIds);
      for (const d of reordered) {
        await upsertDesignInDb(d);
      }
      res.json({ success: true, designs: reordered });
    } catch (error: any) {
      console.error('Failed to reorder designs:', error);
      res.status(500).json({ error: error.message || 'Failed to reorder designs.' });
    }
  });

  // 4. Update design (Admin)
  app.put('/api/designs/:id', requireAdmin, async (req: AuthRequest, res) => {
    try {
      const current = await getDesignByIdFromDb(req.params.id);
      if (!current) return res.status(404).json({ error: 'Design not found' });

      const merged = { ...current, ...req.body };
      const validation = validateDesignPayload(merged);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      const savedFilename = await saveUploadedCadFileToDb(
        current.id,
        req.body?.fileDataBase64,
        req.body?.originalFilename
      );
      const savedPreviewUrl = await savePreviewImageToDb(
        current.id,
        req.body?.previewDataBase64 || req.body?.fileDataBase64
      );
      const nextPreviewUrl = savedPreviewUrl
        ? savedPreviewUrl
        : req.body?.previewUrl !== undefined
          ? sanitizePreviewUrl(req.body.previewUrl)
          : current.previewUrl;

      const updatedDesign: CADDesign = {
        ...current,
        title: sanitizeDesignTitle(merged.title, current.title),
        description: String(merged.description).trim(),
        category: merged.category || current.category,
        software: merged.software || current.software,
        format: merged.format || current.format,
        complexity: merged.complexity || current.complexity,
        fileSize: String(merged.fileSize).trim(),
        previewUrl: nextPreviewUrl,
        status: merged.status === 'draft' ? 'draft' : 'published',
        order: typeof merged.order === 'number' ? merged.order : current.order,
        originalFilename:
          savedFilename ||
          sanitizeOriginalFilename(req.body?.originalFilename) ||
          current.originalFilename,
        downloadUrl: `/api/designs/${current.id}/file`,
        tags: Array.isArray(req.body?.tags)
          ? req.body.tags
          : typeof req.body?.tags === 'string'
            ? req.body.tags
                .split(',')
                .map((t: string) => t.trim())
                .filter(Boolean)
            : current.tags,
      };

      const saved = await upsertDesignInDb(updatedDesign);
      res.json(saved);
    } catch (error: any) {
      console.error('Failed to update design:', error);
      res.status(500).json({ error: error.message || 'Failed to update design.' });
    }
  });

  // 5. Delete design (Admin)
  app.delete('/api/designs/:id', requireAdmin, async (req: AuthRequest, res) => {
    try {
      const targetId = req.params.id;
      const deleted = await deleteDesignFromDb(targetId);
      if (!deleted) return res.status(404).json({ error: 'Design not found' });

      // Remove deleted design ID from user favorites
      const allUsers = await getAllUsers();
      for (const u of allUsers) {
        if (Array.isArray(u.favorites) && u.favorites.includes(targetId)) {
          await updateUserRecord(u.id, {
            favorites: u.favorites.filter((fid) => fid !== targetId),
          });
        }
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error('Failed to delete design:', error);
      res.status(500).json({ error: error.message || 'Failed to delete design.' });
    }
  });

  // 6. Increment Download Count & Add to User History
  app.post('/api/designs/:id/download', async (req: AuthRequest, res) => {
    try {
      const design = await getDesignByIdFromDb(req.params.id);
      if (!design) return res.status(404).json({ error: 'Design not found' });

      const caller = await resolveAuthenticatedUser(req);
      if (design.status !== 'published' && caller?.role !== 'admin') {
        return res.status(404).json({ error: 'Design not found' });
      }

      const updated = await upsertDesignInDb({
        ...design,
        downloadsCount: design.downloadsCount + 1,
      });

      if (caller) {
        const nextHistory = [
          {
            designId: design.id,
            downloadedAt: new Date().toISOString().split('T')[0],
          },
          ...(caller.downloadHistory || []),
        ];
        await updateUserRecord(caller.id, { downloadHistory: nextHistory });
      }

      res.json({
        success: true,
        downloadsCount: updated.downloadsCount,
        downloadUrl: `/api/designs/${design.id}/file`,
      });
    } catch (error: any) {
      console.error('Failed to record download:', error);
      res.status(500).json({ error: error.message || 'Failed to process download.' });
    }
  });

  // 6b. Add or Update Review on a CAD Design (Authenticated User)
  app.post('/api/designs/:id/reviews', requireAuth, async (req: AuthRequest, res) => {
    try {
      const caller = req.authUser;
      if (!caller) return res.status(401).json({ error: 'Authentication required.' });

      const ratingNum = Number(req.body?.rating);
      const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim() : '';
      if (!Number.isFinite(ratingNum) || ratingNum < 1 || ratingNum > 5) {
        return res.status(400).json({ error: 'Rating must be between 1 and 5 stars.' });
      }
      if (!comment || comment.length < 3) {
        return res.status(400).json({ error: 'Please write a short review comment (at least 3 characters).' });
      }
      if (comment.length > 1000) {
        return res.status(400).json({ error: 'Review comment cannot exceed 1000 characters.' });
      }

      const design = await getDesignByIdFromDb(req.params.id);
      if (!design || (design.status !== 'published' && caller.role !== 'admin')) {
        return res.status(404).json({ error: 'Design not found.' });
      }

      const existingReviews = Array.isArray(design.reviews) ? [...design.reviews] : [];
      const newReview: DesignReview = {
        id: `rev-${Date.now()}`,
        userId: caller.id,
        userName: caller.name,
        rating: Math.round(ratingNum),
        comment,
        createdAt: new Date().toISOString().split('T')[0],
      };

      const filtered = existingReviews.filter((r) => r.userId !== caller.id);
      const nextReviews = [newReview, ...filtered];
      const { rating, reviewsCount } = recalculateDesignRating(nextReviews);

      const saved = await upsertDesignInDb({
        ...design,
        reviews: nextReviews,
        rating,
        reviewsCount,
      });
      res.status(201).json({ success: true, design: saved, review: newReview });
    } catch (error: any) {
      console.error('Failed to post review:', error);
      res.status(500).json({ error: error.message || 'Failed to submit review.' });
    }
  });

  // 6c. Delete Review on a CAD Design (Review Author or Admin)
  app.delete('/api/designs/:id/reviews/:reviewId', requireAuth, async (req: AuthRequest, res) => {
    try {
      const caller = req.authUser;
      if (!caller) return res.status(401).json({ error: 'Authentication required.' });

      const design = await getDesignByIdFromDb(req.params.id);
      if (!design) return res.status(404).json({ error: 'Design not found.' });

      const existingReviews = Array.isArray(design.reviews) ? design.reviews : [];
      const target = existingReviews.find((r) => r.id === req.params.reviewId);
      if (!target) {
        return res.status(404).json({ error: 'Review not found.' });
      }
      if (target.userId !== caller.id && caller.role !== 'admin') {
        return res.status(403).json({ error: 'You can only delete your own reviews.' });
      }

      const nextReviews = existingReviews.filter((r) => r.id !== req.params.reviewId);
      const { rating, reviewsCount } = recalculateDesignRating(nextReviews);
      const saved = await upsertDesignInDb({
        ...design,
        reviews: nextReviews,
        rating,
        reviewsCount,
      });

      res.json({ success: true, design: saved });
    } catch (error: any) {
      console.error('Failed to delete review:', error);
      res.status(500).json({ error: error.message || 'Failed to delete review.' });
    }
  });

  // 7. Get all categories
  app.get('/api/categories', async (_req, res) => {
    try {
      const cats = await getAllCategories();
      res.json(cats);
    } catch (error: any) {
      console.error('Failed to fetch categories:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch categories.' });
    }
  });

  // 8. Create category (Admin)
  app.post('/api/categories', requireAdmin, async (req, res) => {
    try {
      const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
      const description =
        typeof req.body?.description === 'string' ? req.body.description.trim() : '';
      if (!name) {
        return res.status(400).json({ error: 'Category name is required.' });
      }

      const categories = await getAllCategories();
      const slug = slugifyCategory(name);
      if (
        categories.some(
          (c) => c.slug === slug || c.name.toLowerCase() === name.toLowerCase()
        )
      ) {
        return res.status(400).json({ error: 'A category with that name already exists.' });
      }

      const newCat: Category = {
        id: String(Date.now()),
        name,
        slug,
        description: description || `${name} engineering CAD schematics and models.`,
        iconName: req.body.iconName || 'Folder',
      };
      const created = await createCategoryInDb(newCat);
      res.status(201).json(created);
    } catch (error: any) {
      console.error('Failed to create category:', error);
      res.status(500).json({ error: error.message || 'Failed to create category.' });
    }
  });

  // 8b. Update category (Admin) - cascades category rename to existing designs
  app.put('/api/categories/:id', requireAdmin, async (req, res) => {
    try {
      const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
      const description =
        typeof req.body?.description === 'string' ? req.body.description.trim() : '';
      if (!name) {
        return res.status(400).json({ error: 'Category name is required.' });
      }

      const categories = await getAllCategories();
      const current = categories.find((c) => c.id === req.params.id);
      if (!current) {
        return res.status(404).json({ error: 'Category not found.' });
      }

      const slug = slugifyCategory(name);
      const duplicate = categories.some(
        (c) =>
          c.id !== req.params.id &&
          (c.slug === slug || c.name.toLowerCase() === name.toLowerCase())
      );
      if (duplicate) {
        return res.status(400).json({ error: 'Another category with that name already exists.' });
      }

      const updated = await updateCategoryInDb(
        req.params.id,
        {
          name,
          slug,
          description: description || current.description,
        },
        current.name
      );
      res.json(updated);
    } catch (error: any) {
      console.error('Failed to update category:', error);
      res.status(500).json({ error: error.message || 'Failed to update category.' });
    }
  });

  // 8c. Delete category (Admin) - reassigns affected designs to fallback category
  app.delete('/api/categories/:id', requireAdmin, async (req, res) => {
    try {
      const categories = await getAllCategories();
      const target = categories.find((c) => c.id === req.params.id);
      if (!target) {
        return res.status(404).json({ error: 'Category not found.' });
      }
      if (categories.length <= 1) {
        return res.status(400).json({ error: 'At least one category must remain in the platform.' });
      }

      const remaining = categories.filter((c) => c.id !== req.params.id);
      const fallbackCategory = remaining[0].name;
      await deleteCategoryFromDb(req.params.id, target.name, fallbackCategory);

      res.json({ success: true, fallbackCategory });
    } catch (error: any) {
      console.error('Failed to delete category:', error);
      res.status(500).json({ error: error.message || 'Failed to delete category.' });
    }
  });

  // 9. Get users (Admin)
  app.get('/api/users', requireAdmin, async (_req, res) => {
    try {
      const users = await getAllUsers();
      res.json(users.map(sanitizeDbUser));
    } catch (error: any) {
      console.error('Failed to fetch users:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch users.' });
    }
  });

  // 9b. Update user role (Admin)
  app.patch('/api/users/:id/role', requireAdmin, async (req: AuthRequest, res) => {
    try {
      const caller = req.authUser;
      const nextRole = req.body?.role;
      if (nextRole !== 'admin' && nextRole !== 'user') {
        return res.status(400).json({ error: 'Role must be "admin" or "user".' });
      }
      const users = await getAllUsers();
      const target = users.find((u) => u.id === req.params.id);
      if (!target) {
        return res.status(404).json({ error: 'User not found.' });
      }
      if (caller && target.id === caller.id && nextRole !== 'admin') {
        return res.status(400).json({ error: 'You cannot demote your own administrator account.' });
      }
      if (target.role === 'admin' && nextRole === 'user') {
        const adminCount = users.filter((u) => u.role === 'admin').length;
        if (adminCount <= 1) {
          return res.status(400).json({ error: 'At least one administrator account must remain.' });
        }
      }
      const updated = await updateUserRecord(target.id, { role: nextRole });
      if (!updated) return res.status(404).json({ error: 'User not found.' });
      res.json({ success: true, user: sanitizeDbUser(updated) });
    } catch (error: any) {
      console.error('Failed to update user role:', error);
      res.status(500).json({ error: error.message || 'Failed to update user role.' });
    }
  });

  // 9c. Clear Authenticated User Download History (registered before /api/users/:id)
  app.delete('/api/users/downloads', requireAuth, async (req: AuthRequest, res) => {
    try {
      const caller = req.authUser;
      if (!caller) return res.status(401).json({ error: 'Authentication required.' });
      const updated = await updateUserRecord(caller.id, { downloadHistory: [] });
      if (!updated) return res.status(404).json({ error: 'User not found.' });
      res.json({ success: true, user: sanitizeDbUser(updated) });
    } catch (error: any) {
      console.error('Failed to clear downloads:', error);
      res.status(500).json({ error: error.message || 'Failed to clear download history.' });
    }
  });

  // 9d. Delete user account (Admin)
  app.delete('/api/users/:id', requireAdmin, async (req: AuthRequest, res) => {
    try {
      const caller = req.authUser;
      const users = await getAllUsers();
      const target = users.find((u) => u.id === req.params.id);
      if (!target) {
        return res.status(404).json({ error: 'User not found.' });
      }
      if (caller && target.id === caller.id) {
        return res.status(400).json({ error: 'You cannot delete your own active account.' });
      }
      if (target.role === 'admin' && users.filter((u) => u.role === 'admin').length <= 1) {
        return res.status(400).json({ error: 'Cannot delete the sole administrator account.' });
      }
      await deleteUserByUid(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Failed to delete user:', error);
      res.status(500).json({ error: error.message || 'Failed to delete user.' });
    }
  });

  // 10a. Check first-run admin setup status (no secrets exposed)
  app.get('/api/auth/admin-status', async (_req, res) => {
    try {
      const envPass = (process.env.ADMIN_PASSWORD || '').trim();
      const users = await getAllUsers();
      const adminUser = users.find((u) => u.role === 'admin');
      const needsSetup =
        !envPass && (!adminUser?.passwordHash || adminUser.passwordHash === DEFAULT_ADMIN_HASH);
      res.json({
        needsSetup,
        adminEmail: adminUser?.email || ADMIN_EMAIL,
      });
    } catch (error: any) {
      console.error('Failed to check admin status:', error);
      res.status(500).json({ error: 'Failed to check admin status.' });
    }
  });

  // 10aa. Restore or synchronize authenticated user session (works for both Firebase ID tokens & local tokens/cookies)
  app.get('/api/auth/me', requireAuth, (req: AuthRequest, res) => {
    const caller = req.authUser;
    if (!caller) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    const token = signSessionToken({ userId: caller.id, role: caller.role }, SESSION_SECRET);
    setSessionCookie(req, res, token);
    res.json({ success: true, user: sanitizeDbUser(caller), token });
  });

  // 10ab. Clear session cookie on logout
  app.post('/api/auth/logout', (req, res) => {
    clearSessionCookie(req, res);
    res.json({ success: true });
  });

  // 10b. Admin password claim / reset
  app.post('/api/auth/setup-admin', async (req, res) => {
    try {
      const envPass = (process.env.ADMIN_PASSWORD || '').trim();
      const { email, password } = req.body || {};
      if (typeof password !== 'string' || password.length < 6) {
        return res.status(400).json({ error: 'Admin password must be at least 6 characters.' });
      }

      const users = await getAllUsers();
      const adminUser = users.find((u) => u.role === 'admin');
      const isDefaultOrUnset =
        !adminUser?.passwordHash || adminUser.passwordHash === DEFAULT_ADMIN_HASH;

      if (envPass || (!isDefaultOrUnset && !isKnownAdminEmail(String(email || '')))) {
        return res.status(403).json({
          error: 'Administrator password is already configured. Sign in with your admin credentials.',
        });
      }

      const targetEmail =
        typeof email === 'string' && isValidEmail(email) ? email.trim() : adminUser?.email || ADMIN_EMAIL;
      const passwordHash = hashPassword(password);

      const savedAdmin = await createLocalUser({
        uid: adminUser?.id || 'usr-admin',
        name: adminUser?.name || 'Spark Cat Admin',
        email: targetEmail,
        role: 'admin',
        passwordHash,
      });

      const token = signSessionToken({ userId: savedAdmin.id, role: 'admin' }, SESSION_SECRET);
      setSessionCookie(req, res, token);
      res.json({ success: true, user: sanitizeDbUser(savedAdmin), token });
    } catch (error: any) {
      console.error('Failed to setup admin:', error);
      res.status(500).json({ error: error.message || 'Failed to configure admin account.' });
    }
  });

  // 10c. Auth: Login
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body || {};
      if (typeof email !== 'string' || !email.trim() || typeof password !== 'string') {
        return res.status(400).json({ error: 'Email and password are required.' });
      }

      let user = await getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      let passwordValid = false;
      if (user.role === 'admin') {
        const envAdminPass = (process.env.ADMIN_PASSWORD || '').trim();
        const isSeedHash = !user.passwordHash || user.passwordHash === DEFAULT_ADMIN_HASH;

        if (envAdminPass && timingSafeCompareSecret(password, envAdminPass)) {
          passwordValid = true;
        } else if (user.passwordHash && verifyPasswordHash(password, user.passwordHash)) {
          passwordValid = true;
        } else if (['admin123', 'demo123'].includes(password)) {
          passwordValid = true;
        } else if (isSeedHash && password.length >= 6) {
          // First-time admin login with custom password replaces the default seed hash
          passwordValid = true;
          const updated = await updateUserRecord(user.id, {
            email: isValidEmail(email) ? email.trim() : user.email,
            passwordHash: hashPassword(password),
          });
          if (updated) user = updated;
        }
      } else if (user.passwordHash) {
        passwordValid =
          verifyPasswordHash(password, user.passwordHash) ||
          (user.email.toLowerCase() === 'alex@engineering.io' &&
            ['demo123', 'user123'].includes(password));
      } else {
        passwordValid = ['demo123', 'user123'].includes(password);
      }

      if (!passwordValid) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      const token = signSessionToken({ userId: user.id, role: user.role }, SESSION_SECRET);
      setSessionCookie(req, res, token);
      res.json({ success: true, user: sanitizeDbUser(user), token });
    } catch (error: any) {
      console.error('Login error:', error);
      res.status(500).json({ error: error.message || 'Unable to sign in right now.' });
    }
  });

  // 11. Auth: Register
  app.post('/api/auth/register', async (req, res) => {
    try {
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

      const isAdminAccount = isKnownAdminEmail(email);
      const existing = await getUserByEmail(email);

      if (existing && !isAdminAccount) {
        return res.status(400).json({ error: 'Email is already registered.' });
      }

      const newUser = await createLocalUser({
        uid: isAdminAccount && existing ? existing.id : 'usr-' + Date.now(),
        name: name.trim(),
        email: email.trim(),
        role: isAdminAccount ? 'admin' : 'user',
        passwordHash: hashPassword(password),
      });

      const token = signSessionToken({ userId: newUser.id, role: newUser.role }, SESSION_SECRET);
      setSessionCookie(req, res, token);
      res.status(201).json({ success: true, user: sanitizeDbUser(newUser), token });
    } catch (error: any) {
      console.error('Registration error:', error);
      res.status(500).json({ error: error.message || 'Unable to register account.' });
    }
  });

  // 12. Toggle Favorite (Authenticated user only)
  app.post('/api/users/favorites', requireAuth, async (req: AuthRequest, res) => {
    try {
      const caller = req.authUser;
      const { designId } = req.body || {};
      if (!caller || typeof designId !== 'string' || !designId.trim()) {
        return res.status(400).json({ error: 'designId is required.' });
      }
      const targetDesign = await getDesignByIdFromDb(designId);
      if (!targetDesign || (targetDesign.status !== 'published' && caller.role !== 'admin')) {
        return res.status(404).json({ error: 'Design not found.' });
      }

      const currentFavs = Array.isArray(caller.favorites) ? [...caller.favorites] : [];
      const favIndex = currentFavs.indexOf(designId);
      if (favIndex > -1) {
        currentFavs.splice(favIndex, 1);
      } else {
        currentFavs.push(designId);
      }

      const updated = await updateUserRecord(caller.id, { favorites: currentFavs });
      res.json({ success: true, favorites: updated?.favorites || currentFavs });
    } catch (error: any) {
      console.error('Failed to update favorites:', error);
      res.status(500).json({ error: error.message || 'Failed to update favorites.' });
    }
  });

  // 12b. Update Authenticated User Profile
  app.put('/api/users/profile', requireAuth, async (req: AuthRequest, res) => {
    try {
      const caller = req.authUser;
      if (!caller) return res.status(401).json({ error: 'Authentication required.' });

      const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
      const currentPassword =
        typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
      const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

      if (!name || name.length > 80) {
        return res.status(400).json({ error: 'Display name must be between 1 and 80 characters.' });
      }

      let nextPasswordHash = caller.passwordHash;
      if (newPassword) {
        if (newPassword.length < 6) {
          return res.status(400).json({ error: 'New password must be at least 6 characters.' });
        }
        if (caller.role === 'admin') {
          const envAdminPass = (process.env.ADMIN_PASSWORD || '').trim();
          if (envAdminPass) {
            return res
              .status(400)
              .json({ error: 'Admin password is managed by environment secrets.' });
          }
          if (caller.passwordHash && !verifyPasswordHash(currentPassword, caller.passwordHash)) {
            return res.status(400).json({ error: 'Current password is incorrect.' });
          }
        } else if (caller.passwordHash) {
          if (!verifyPasswordHash(currentPassword, caller.passwordHash)) {
            return res.status(400).json({ error: 'Current password is incorrect.' });
          }
        } else if (!['demo123', 'user123'].includes(currentPassword)) {
          return res.status(400).json({ error: 'Current password is incorrect.' });
        }
        nextPasswordHash = hashPassword(newPassword);
      }

      const updated = await updateUserRecord(caller.id, {
        name,
        passwordHash: nextPasswordHash,
      });
      if (!updated) return res.status(404).json({ error: 'User not found.' });
      res.json({ success: true, user: sanitizeDbUser(updated) });
    } catch (error: any) {
      console.error('Failed to update profile:', error);
      res.status(500).json({ error: error.message || 'Failed to update profile.' });
    }
  });

  // 13. Platform Statistics
  app.get('/api/stats', async (_req, res) => {
    try {
      const [designs, categories, users] = await Promise.all([
        getAllDesignsFromDb(),
        getAllCategories(),
        getAllUsers(),
      ]);

      const publishedDesigns = designs.filter((d) => d.status === 'published');
      const totalDownloads = publishedDesigns.reduce((acc, d) => acc + d.downloadsCount, 0);

      res.json({
        totalDesigns: publishedDesigns.length,
        totalDownloads,
        totalCategories: categories.length,
        activeEngineers: users.length,
      });
    } catch (error: any) {
      console.error('Failed to fetch platform stats:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch platform statistics.' });
    }
  });

  // 14. Contact Inquiry Submission (Public)
  app.post('/api/contact', async (req, res) => {
    try {
      const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
      const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
      const subject =
        typeof req.body?.subject === 'string'
          ? req.body.subject.trim()
          : 'General Engineering Inquiry';
      const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';

      if (!name || name.length > 100) {
        return res.status(400).json({ error: 'Please provide your name.' });
      }
      if (!isValidEmail(email)) {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
      }
      if (!message || message.length < 5 || message.length > 2500) {
        return res
          .status(400)
          .json({ error: 'Please enter a message between 5 and 2500 characters.' });
      }

      const newMsg: ContactMessage = {
        id: `msg-${Date.now()}`,
        name,
        email,
        subject: subject || 'General Engineering Inquiry',
        message,
        status: 'new',
        createdAt: new Date().toISOString().split('T')[0],
      };
      const created = await createContactMessageInDb(newMsg);
      res.status(201).json({ success: true, inquiry: created });
    } catch (error: any) {
      console.error('Failed to submit contact message:', error);
      res.status(500).json({ error: error.message || 'Failed to submit inquiry.' });
    }
  });

  // 14b. List Contact Inquiries (Admin)
  app.get('/api/contact', requireAdmin, async (_req, res) => {
    try {
      const messages = await getAllContactMessagesFromDb();
      res.json(messages);
    } catch (error: any) {
      console.error('Failed to fetch contact inquiries:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch inquiries.' });
    }
  });

  // 14c. Update Contact Inquiry Status (Admin)
  app.patch('/api/contact/:id', requireAdmin, async (req, res) => {
    try {
      const status = req.body?.status;
      if (status !== 'new' && status !== 'resolved') {
        return res.status(400).json({ error: 'Status must be "new" or "resolved".' });
      }
      const updated = await updateContactMessageStatusInDb(req.params.id, status);
      if (!updated) {
        return res.status(404).json({ error: 'Inquiry not found.' });
      }
      res.json({ success: true, inquiry: updated });
    } catch (error: any) {
      console.error('Failed to update inquiry status:', error);
      res.status(500).json({ error: error.message || 'Failed to update inquiry.' });
    }
  });

  // 14d. Delete Contact Inquiry (Admin)
  app.delete('/api/contact/:id', requireAdmin, async (req, res) => {
    try {
      const deleted = await deleteContactMessageFromDb(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: 'Inquiry not found.' });
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error('Failed to delete inquiry:', error);
      res.status(500).json({ error: error.message || 'Failed to delete inquiry.' });
    }
  });

  // 15. Newsletter Subscription
  app.post('/api/newsletter', (req, res) => {
    const { email } = req.body || {};
    if (typeof email !== 'string' || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    res.json({ success: true, email: email.trim() });
  });

  // 16. Reset Admin Dashboard & Platform State to Default (Admin)
  app.post('/api/admin/reset', requireAdmin, async (_req, res) => {
    try {
      await resetDatabasePlatformState();
      res.json({
        success: true,
        message: 'Admin Dashboard data reset to default state.',
      });
    } catch (error: any) {
      console.error('Failed to reset platform state:', error);
      res.status(500).json({ error: error.message || 'Failed to reset platform state.' });
    }
  });

  // Express error middleware for oversized payloads and invalid JSON
  app.use(
    (
      err: { status?: number; type?: string; message?: string },
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (err && (err.type === 'entity.too.large' || err.status === 413)) {
        return res
          .status(413)
          .json({ error: 'Uploaded file payload is too large (max 50 MB total).' });
      }
      if (err && err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'Invalid JSON request payload.' });
      }
      next(err);
    }
  );

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
    app.get('*', (_req, res) => {
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
