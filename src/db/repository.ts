import { asc, eq } from 'drizzle-orm';
import { db } from './index.ts';
import {
  categories,
  contactMessages,
  designs,
  storageFiles,
  users,
} from './schema.ts';
import { ensureSeedUsers, SEED_USERS } from './users.ts';
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
    title: row.title,
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

let seedCategoriesInFlight: Promise<void> | null = null;

export async function ensureSeedCategories(): Promise<void> {
  if (seedCategoriesInFlight) {
    return seedCategoriesInFlight;
  }

  seedCategoriesInFlight = (async () => {
    try {
      const existing = await db.select().from(categories);
      if (existing.length > 0) return;

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
    } catch (error) {
      console.error('Database ensureSeedCategories failed:', error);
      throw new Error('Failed to initialize categories in database.', { cause: error });
    } finally {
      seedCategoriesInFlight = null;
    }
  })();

  return seedCategoriesInFlight;
}

export async function getAllCategories(): Promise<Category[]> {
  try {
    await ensureSeedCategories();
    const rows = await db.select().from(categories).orderBy(asc(categories.id));
    return rows.map(mapRowToCategory);
  } catch (error) {
    console.error('Database getAllCategories failed:', error);
    throw new Error('Failed to fetch categories from database.', { cause: error });
  }
}

export async function createCategoryInDb(cat: Category): Promise<Category> {
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
    return mapRowToCategory(inserted[0]);
  } catch (error) {
    console.error('Database createCategoryInDb failed:', error);
    throw new Error('Failed to create category in database.', { cause: error });
  }
}

export async function updateCategoryInDb(
  id: string,
  updates: { name: string; slug: string; description: string },
  previousName: string
): Promise<Category | null> {
  try {
    const updated = await db
      .update(categories)
      .set(updates)
      .where(eq(categories.id, id))
      .returning();
    if (updated.length === 0) return null;

    if (previousName !== updates.name) {
      await db
        .update(designs)
        .set({ category: updates.name })
        .where(eq(designs.category, previousName));
    }
    return mapRowToCategory(updated[0]);
  } catch (error) {
    console.error('Database updateCategoryInDb failed:', error);
    throw new Error('Failed to update category in database.', { cause: error });
  }
}

export async function deleteCategoryFromDb(
  id: string,
  deletedCategoryName: string,
  fallbackCategoryName: string
): Promise<void> {
  try {
    await db.delete(categories).where(eq(categories.id, id));
    await db
      .update(designs)
      .set({ category: fallbackCategoryName })
      .where(eq(designs.category, deletedCategoryName));
  } catch (error) {
    console.error('Database deleteCategoryFromDb failed:', error);
    throw new Error('Failed to delete category from database.', { cause: error });
  }
}

export async function getAllDesignsFromDb(): Promise<CADDesign[]> {
  try {
    const rows = await db.select().from(designs).orderBy(asc(designs.order));
    return rows.map(mapRowToDesign);
  } catch (error) {
    console.error('Database getAllDesignsFromDb failed:', error);
    throw new Error('Failed to fetch CAD designs from database.', { cause: error });
  }
}

export async function getDesignByIdFromDb(id: string): Promise<CADDesign | null> {
  try {
    const rows = await db.select().from(designs).where(eq(designs.id, id));
    return rows.length > 0 ? mapRowToDesign(rows[0]) : null;
  } catch (error) {
    console.error('Database getDesignByIdFromDb failed:', error);
    throw new Error('Failed to fetch CAD design from database.', { cause: error });
  }
}

export async function upsertDesignInDb(design: CADDesign): Promise<CADDesign> {
  try {
    const values = {
      id: design.id,
      title: design.title,
      description: design.description,
      category: design.category,
      software: design.software,
      format: design.format,
      complexity: design.complexity,
      fileSize: design.fileSize,
      previewUrl: design.previewUrl,
      downloadUrl: design.downloadUrl,
      originalFilename: design.originalFilename ?? null,
      downloadsCount: design.downloadsCount,
      rating: design.rating,
      reviewsCount: design.reviewsCount,
      reviews: Array.isArray(design.reviews) ? design.reviews : ([] as DesignReview[]),
      uploadedBy: design.uploadedBy,
      uploadedAt: design.uploadedAt,
      status: design.status,
      order: typeof design.order === 'number' ? design.order : 0,
      tags: Array.isArray(design.tags) ? design.tags : [],
    };

    const upserted = await db
      .insert(designs)
      .values(values)
      .onConflictDoUpdate({
        target: designs.id,
        set: values,
      })
      .returning();

    return mapRowToDesign(upserted[0]);
  } catch (error) {
    console.error('Database upsertDesignInDb failed:', error);
    throw new Error('Failed to save CAD design to database.', { cause: error });
  }
}

export async function deleteDesignFromDb(id: string): Promise<boolean> {
  try {
    await db.delete(storageFiles).where(eq(storageFiles.designId, id));
    const deleted = await db.delete(designs).where(eq(designs.id, id)).returning();
    return deleted.length > 0;
  } catch (error) {
    console.error('Database deleteDesignFromDb failed:', error);
    throw new Error('Failed to delete CAD design from database.', { cause: error });
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
    console.error('Database saveStorageFileInDb failed:', error);
    throw new Error('Failed to store uploaded file in database.', { cause: error });
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
    if (rows.length === 0) return null;
    const row = rows[0];
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
    console.error('Database getStorageFileFromDb failed:', error);
    throw new Error('Failed to retrieve stored file from database.', { cause: error });
  }
}

export async function getAllContactMessagesFromDb(): Promise<ContactMessage[]> {
  try {
    const rows = await db.select().from(contactMessages);
    return rows.map(mapRowToMessage).reverse();
  } catch (error) {
    console.error('Database getAllContactMessagesFromDb failed:', error);
    throw new Error('Failed to fetch inquiries from database.', { cause: error });
  }
}

export async function createContactMessageInDb(msg: ContactMessage): Promise<ContactMessage> {
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
    return mapRowToMessage(inserted[0]);
  } catch (error) {
    console.error('Database createContactMessageInDb failed:', error);
    throw new Error('Failed to save contact message to database.', { cause: error });
  }
}

export async function updateContactMessageStatusInDb(
  id: string,
  status: 'new' | 'resolved'
): Promise<ContactMessage | null> {
  try {
    const updated = await db
      .update(contactMessages)
      .set({ status })
      .where(eq(contactMessages.id, id))
      .returning();
    return updated.length > 0 ? mapRowToMessage(updated[0]) : null;
  } catch (error) {
    console.error('Database updateContactMessageStatusInDb failed:', error);
    throw new Error('Failed to update contact message status.', { cause: error });
  }
}

export async function deleteContactMessageFromDb(id: string): Promise<boolean> {
  try {
    const deleted = await db
      .delete(contactMessages)
      .where(eq(contactMessages.id, id))
      .returning();
    return deleted.length > 0;
  } catch (error) {
    console.error('Database deleteContactMessageFromDb failed:', error);
    throw new Error('Failed to delete contact message.', { cause: error });
  }
}

export async function resetDatabasePlatformState(): Promise<void> {
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
    console.error('Database resetDatabasePlatformState failed:', error);
    throw new Error('Failed to reset platform state in database.', { cause: error });
  }
}
