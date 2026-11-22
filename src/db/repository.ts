import { asc, eq } from 'drizzle-orm';
import { db, ensureDatabaseSchemaInitialized } from './index.ts';
import {
  categories,
  contactMessages,
  designs,
  storageFiles,
  users,
} from './schema.ts';
import { ensureSeedUsers, SEED_USERS } from './users.ts';
import { sanitizeDesignTitle } from '../utils/cadHelpers.ts';
import { deleteFromSupabaseStorage } from '../lib/supabaseStorage.ts';
import type { CADDesign, Category, ContactMessage, DesignReview } from '../types.ts';

export const SEED_CATEGORIES: Category[] = [
  {
    id: '1',
    name: 'Electrical Engineering',
    slug: 'electrical',
    description: 'Power distribution, schematics, control panels, and wiring diagrams.',
    iconName: 'Zap',
  },
  {
    id: '2',
    name: 'Mechanical CAD',
    slug: 'mechanical',
    description: 'Machine parts, assemblies, gears, and pneumatic systems.',
    iconName: 'Cog',
  },
  {
    id: '3',
    name: 'Industrial Automation',
    slug: 'automation',
    description: 'PLC layouts, robotics, sensor arrays, and automation cells.',
    iconName: 'Cpu',
  },
  {
    id: '4',
    name: 'Architectural & MEP',
    slug: 'architectural',
    description: 'Building floor plans, HVAC ducting, plumbing, and electrical layouts.',
    iconName: 'Building',
  },
  {
    id: '5',
    name: 'Solar & Renewable',
    slug: 'solar',
    description: 'Photovoltaic layouts, string inverter schematics, and mounting racks.',
    iconName: 'Sun',
  },
];

function mapRowToDesign(row: typeof designs.$inferSelect): CADDesign {
  return {
    id: row.id,
    title: sanitizeDesignTitle(row.title),
    description: row.description,
    category: row.category,
    software: row.software as CADDesign['software'],
    format: row.format as CADDesign['format'],
    complexity: row.complexity as CADDesign['complexity'],
    fileSize: row.fileSize,
    previewUrl: row.previewUrl,
    downloadUrl: row.downloadUrl,
    originalFilename: row.originalFilename || undefined,
    downloadsCount: row.downloadsCount,
    rating: row.rating,
    reviewsCount: row.reviewsCount,
    reviews: Array.isArray(row.reviews) ? row.reviews : [],
    uploadedBy: row.uploadedBy,
    uploadedAt: row.uploadedAt,
    status: row.status === 'draft' ? 'draft' : 'published',
    order: row.order,
    tags: Array.isArray(row.tags) ? row.tags : [],
  };
}

function mapRowToCategory(row: typeof categories.$inferSelect): Category {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    iconName: row.iconName,
  };
}

function mapRowToMessage(row: typeof contactMessages.$inferSelect): ContactMessage {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    subject: row.subject,
    message: row.message,
    status: row.status === 'resolved' ? 'resolved' : 'new',
    createdAt: row.createdAt,
  };
}

let categoriesSeeded = false;
let seedCategoriesInFlight: Promise<void> | null = null;
const memoryCategoriesCache = new Map<string, Category>(
  SEED_CATEGORIES.map((c) => [c.id, { ...c }])
);
const memoryDesignsCache = new Map<string, CADDesign>();
const memoryStorageCache = new Map<
  string,
  {
    id: string;
    designId: string;
    fileType: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    dataBase64: string;
  }
>();
const memoryMessagesCache = new Map<string, ContactMessage>();

function syncCategoryCache(cat: Category): Category {
  memoryCategoriesCache.set(cat.id, { ...cat });
  return cat;
}

function syncDesignCache(design: CADDesign): CADDesign {
  memoryDesignsCache.set(design.id, { ...design });
  return design;
}

function syncMessageCache(msg: ContactMessage): ContactMessage {
  memoryMessagesCache.set(msg.id, { ...msg });
  return msg;
}

export async function ensureSeedCategories(): Promise<void> {
  if (categoriesSeeded) return;
  if (seedCategoriesInFlight) {
    return seedCategoriesInFlight;
  }

  seedCategoriesInFlight = (async () => {
    try {
      await ensureDatabaseSchemaInitialized();
      const existing = await db.select().from(categories);
      if (existing.length > 0) {
        for (const row of existing) {
          syncCategoryCache(mapRowToCategory(row));
        }
        categoriesSeeded = true;
        return;
      }

      for (const cat of SEED_CATEGORIES) {
        await db
          .insert(categories)
          .values({
            id: cat.id,
            name: cat.name,
            slug: cat.slug,
            description: cat.description,
            iconName: cat.iconName,
          })
          .onConflictDoNothing();
        syncCategoryCache(cat);
      }
      categoriesSeeded = true;
    } catch (error) {
      console.warn('Database ensureSeedCategories transient warning (using cached categories):', error);
    } finally {
      seedCategoriesInFlight = null;
    }
  })();

  return seedCategoriesInFlight;
}

export async function getAllCategories(): Promise<Category[]> {
  await ensureSeedCategories();
  try {
    const rows = await db.select().from(categories).orderBy(asc(categories.id));
    if (rows.length > 0) {
      memoryCategoriesCache.clear();
      return rows.map((r) => syncCategoryCache(mapRowToCategory(r)));
    }
    return Array.from(memoryCategoriesCache.values());
  } catch (error) {
    console.warn('Database getAllCategories fallback to memory cache:', error);
    return Array.from(memoryCategoriesCache.values());
  }
}

export async function createCategoryInDb(cat: Category): Promise<Category> {
  syncCategoryCache(cat);
  try {
    const inserted = await db
      .insert(categories)
      .values({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
        iconName: cat.iconName,
      })
      .returning();
    return syncCategoryCache(mapRowToCategory(inserted[0]));
  } catch (error) {
    console.warn('Database createCategoryInDb fallback to memory cache:', error);
    return cat;
  }
}

export async function updateCategoryInDb(
  id: string,
  updates: { name: string; slug: string; description: string },
  previousName: string
): Promise<Category | null> {
  const existing = memoryCategoriesCache.get(id);
  if (existing) {
    syncCategoryCache({ ...existing, ...updates });
  }
  for (const d of memoryDesignsCache.values()) {
    if (d.category === previousName && previousName !== updates.name) {
      syncDesignCache({ ...d, category: updates.name });
    }
  }
  try {
    const updated = await db
      .update(categories)
      .set(updates)
      .where(eq(categories.id, id))
      .returning();
    if (updated.length === 0) return memoryCategoriesCache.get(id) || null;

    if (previousName !== updates.name) {
      await db
        .update(designs)
        .set({ category: updates.name })
        .where(eq(designs.category, previousName));
    }
    return syncCategoryCache(mapRowToCategory(updated[0]));
  } catch (error) {
    console.warn('Database updateCategoryInDb fallback to memory cache:', error);
    return memoryCategoriesCache.get(id) || null;
  }
}

export async function deleteCategoryFromDb(
  id: string,
  deletedCategoryName: string,
  fallbackCategoryName: string
): Promise<void> {
  memoryCategoriesCache.delete(id);
  for (const d of memoryDesignsCache.values()) {
    if (d.category === deletedCategoryName) {
      syncDesignCache({ ...d, category: fallbackCategoryName });
    }
  }
  try {
    await db.delete(categories).where(eq(categories.id, id));
    await db
      .update(designs)
      .set({ category: fallbackCategoryName })
      .where(eq(designs.category, deletedCategoryName));
  } catch (error) {
    console.warn('Database deleteCategoryFromDb fallback to memory cache:', error);
  }
}

export async function getAllDesignsFromDb(): Promise<CADDesign[]> {
  try {
    await ensureDatabaseSchemaInitialized();
    const rows = await db.select().from(designs).orderBy(asc(designs.order));
    memoryDesignsCache.clear();
    return rows.map((r) => syncDesignCache(mapRowToDesign(r)));
  } catch (error) {
    console.warn('Database getAllDesignsFromDb fallback to memory cache:', error);
    return Array.from(memoryDesignsCache.values()).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
}

export async function getDesignByIdFromDb(id: string): Promise<CADDesign | null> {
  try {
    const rows = await db.select().from(designs).where(eq(designs.id, id));
    return rows.length > 0 ? syncDesignCache(mapRowToDesign(rows[0])) : memoryDesignsCache.get(id) || null;
  } catch (error) {
    console.warn('Database getDesignByIdFromDb fallback to memory cache:', error);
    return memoryDesignsCache.get(id) || null;
  }
}

export async function upsertDesignInDb(design: CADDesign): Promise<CADDesign> {
  const normalized: CADDesign = {
    ...design,
    title: sanitizeDesignTitle(design.title),
    reviews: Array.isArray(design.reviews) ? design.reviews : [],
    order: typeof design.order === 'number' ? design.order : 0,
    tags: Array.isArray(design.tags) ? design.tags : [],
  };
  syncDesignCache(normalized);

  try {
    const values = {
      id: normalized.id,
      title: normalized.title,
      description: normalized.description,
      category: normalized.category,
      software: normalized.software,
      format: normalized.format,
      complexity: normalized.complexity,
      fileSize: normalized.fileSize,
      previewUrl: normalized.previewUrl,
      downloadUrl: normalized.downloadUrl,
      originalFilename: normalized.originalFilename ?? null,
      downloadsCount: normalized.downloadsCount,
      rating: normalized.rating,
      reviewsCount: normalized.reviewsCount,
      reviews: normalized.reviews as DesignReview[],
      uploadedBy: normalized.uploadedBy,
      uploadedAt: normalized.uploadedAt,
      status: normalized.status,
      order: normalized.order ?? 0,
      tags: normalized.tags,
    };

    const upserted = await db
      .insert(designs)
      .values(values)
      .onConflictDoUpdate({
        target: designs.id,
        set: values,
      })
      .returning();

    return syncDesignCache(mapRowToDesign(upserted[0]));
  } catch (error) {
    console.warn('Database upsertDesignInDb fallback to memory cache:', error);
    return normalized;
  }
}

export async function deleteDesignFromDb(id: string): Promise<boolean> {
  const hadCached = memoryDesignsCache.delete(id);
  memoryStorageCache.delete(`preview-${id}`);
  memoryStorageCache.delete(`cad-${id}`);
  try {
    const existingFiles = await db
      .select()
      .from(storageFiles)
      .where(eq(storageFiles.designId, id));
    const pathsToRemove: string[] = [];
    for (const f of existingFiles) {
      if (f.fileType === 'preview') {
        pathsToRemove.push(`previews/${f.filename}`);
      } else if (f.fileType === 'cad') {
        pathsToRemove.push(`files/${id}/${f.filename}`);
      }
    }
    if (pathsToRemove.length > 0) {
      await deleteFromSupabaseStorage(pathsToRemove);
    }

    await db.delete(storageFiles).where(eq(storageFiles.designId, id));
    const deleted = await db.delete(designs).where(eq(designs.id, id)).returning();
    return deleted.length > 0 || hadCached;
  } catch (error) {
    console.warn('Database deleteDesignFromDb fallback to memory cache:', error);
    return hadCached || true;
  }
}

export async function saveStorageFileInDb(params: {
  id: string;
  designId: string;
  fileType: 'preview' | 'cad';
  filename: string;
  mimeType: string;
  sizeBytes: number;
  dataBase64: string;
}): Promise<void> {
  memoryStorageCache.set(params.id, { ...params });
  try {
    await db
      .insert(storageFiles)
      .values({
        id: params.id,
        designId: params.designId,
        fileType: params.fileType,
        filename: params.filename,
        mimeType: params.mimeType,
        sizeBytes: params.sizeBytes,
        dataBase64: params.dataBase64,
      })
      .onConflictDoUpdate({
        target: storageFiles.id,
        set: {
          filename: params.filename,
          mimeType: params.mimeType,
          sizeBytes: params.sizeBytes,
          dataBase64: params.dataBase64,
        },
      });
  } catch (error) {
    console.warn('Database saveStorageFileInDb fallback to memory cache:', error);
  }
}

export async function getStorageFileFromDb(
  id: string
): Promise<{
  id: string;
  designId: string;
  fileType: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  buffer: Buffer;
} | null> {
  try {
    const rows = await db.select().from(storageFiles).where(eq(storageFiles.id, id));
    if (rows.length === 0) {
      const cached = memoryStorageCache.get(id);
      if (!cached) return null;
      return {
        ...cached,
        buffer: Buffer.from(cached.dataBase64, 'base64'),
      };
    }
    const row = rows[0];
    memoryStorageCache.set(row.id, {
      id: row.id,
      designId: row.designId,
      fileType: row.fileType,
      filename: row.filename,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      dataBase64: row.dataBase64,
    });
    return {
      id: row.id,
      designId: row.designId,
      fileType: row.fileType,
      filename: row.filename,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      buffer: Buffer.from(row.dataBase64, 'base64'),
    };
  } catch (error) {
    console.warn('Database getStorageFileFromDb fallback to memory cache:', error);
    const cached = memoryStorageCache.get(id);
    if (!cached) return null;
    return {
      ...cached,
      buffer: Buffer.from(cached.dataBase64, 'base64'),
    };
  }
}

export async function getAllContactMessagesFromDb(): Promise<ContactMessage[]> {
  try {
    const rows = await db.select().from(contactMessages);
    memoryMessagesCache.clear();
    return rows.map((r) => syncMessageCache(mapRowToMessage(r))).reverse();
  } catch (error) {
    console.warn('Database getAllContactMessagesFromDb fallback to memory cache:', error);
    return Array.from(memoryMessagesCache.values()).reverse();
  }
}

export async function createContactMessageInDb(msg: ContactMessage): Promise<ContactMessage> {
  syncMessageCache(msg);
  try {
    const inserted = await db
      .insert(contactMessages)
      .values({
        id: msg.id,
        name: msg.name,
        email: msg.email,
        subject: msg.subject || 'General Inquiry',
        message: msg.message,
        status: msg.status,
        createdAt: msg.createdAt,
      })
      .returning();
    return syncMessageCache(mapRowToMessage(inserted[0]));
  } catch (error) {
    console.warn('Database createContactMessageInDb fallback to memory cache:', error);
    return msg;
  }
}

export async function updateContactMessageStatusInDb(
  id: string,
  status: 'new' | 'resolved'
): Promise<ContactMessage | null> {
  const cached = memoryMessagesCache.get(id);
  if (cached) {
    syncMessageCache({ ...cached, status });
  }
  try {
    const updated = await db
      .update(contactMessages)
      .set({ status })
      .where(eq(contactMessages.id, id))
      .returning();
    return updated.length > 0 ? syncMessageCache(mapRowToMessage(updated[0])) : memoryMessagesCache.get(id) || null;
  } catch (error) {
    console.warn('Database updateContactMessageStatusInDb fallback to memory cache:', error);
    return memoryMessagesCache.get(id) || null;
  }
}

export async function deleteContactMessageFromDb(id: string): Promise<boolean> {
  const hadCached = memoryMessagesCache.delete(id);
  try {
    const deleted = await db
      .delete(contactMessages)
      .where(eq(contactMessages.id, id))
      .returning();
    return deleted.length > 0 || hadCached;
  } catch (error) {
    console.warn('Database deleteContactMessageFromDb fallback to memory cache:', error);
    return hadCached || true;
  }
}

export async function resetDatabasePlatformState(): Promise<void> {
  memoryStorageCache.clear();
  memoryDesignsCache.clear();
  memoryCategoriesCache.clear();
  for (const cat of SEED_CATEGORIES) {
    syncCategoryCache(cat);
  }
  try {
    await db.delete(storageFiles);
    await db.delete(designs);
    await db.delete(categories);

    for (const cat of SEED_CATEGORIES) {
      await db
        .insert(categories)
        .values({
          id: cat.id,
          name: cat.name,
          slug: cat.slug,
          description: cat.description,
          iconName: cat.iconName,
        })
        .onConflictDoNothing();
    }

    await ensureSeedUsers();
    const allUsers = await db.select().from(users);
    for (const u of allUsers) {
      await db
        .update(users)
        .set({ favorites: [], downloadHistory: [] })
        .where(eq(users.uid, u.uid));
    }

    for (const seed of SEED_USERS) {
      await db
        .insert(users)
        .values({
          uid: seed.id,
          name: seed.name,
          email: seed.email,
          role: seed.role,
          favorites: [],
          downloadHistory: [],
          passwordHash: seed.passwordHash ?? null,
          createdAt: seed.createdAt,
        })
        .onConflictDoNothing();
    }
  } catch (error) {
    console.warn('Database resetDatabasePlatformState transient warning:', error);
  }
}
