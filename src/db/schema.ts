import { relations } from 'drizzle-orm';
import {
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import type { DesignReview } from '../types.ts';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  role: text('role').notNull().default('user'),
  favorites: jsonb('favorites').$type<string[]>().notNull().default([]),
  downloadHistory: jsonb('download_history')
    .$type<{ designId: string; downloadedAt: string }[]>()
    .notNull()
    .default([]),
  passwordHash: text('password_hash'),
  createdAt: text('created_at').notNull(),
});

export const categories = pgTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull(),
  description: text('description').notNull(),
  iconName: text('icon_name').notNull().default('Folder'),
});

export const designs = pgTable('designs', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  category: text('category').notNull(),
  software: text('software').notNull(),
  format: text('format').notNull(),
  complexity: text('complexity').notNull(),
  fileSize: text('file_size').notNull(),
  previewUrl: text('preview_url').notNull(),
  downloadUrl: text('download_url').notNull(),
  originalFilename: text('original_filename'),
  downloadsCount: integer('downloads_count').notNull().default(0),
  rating: doublePrecision('rating').notNull().default(5.0),
  reviewsCount: integer('reviews_count').notNull().default(0),
  reviews: jsonb('reviews').$type<DesignReview[]>().notNull().default([]),
  uploadedBy: text('uploaded_by').notNull(),
  uploadedAt: text('uploaded_at').notNull(),
  status: text('status').notNull().default('published'),
  order: integer('sort_order').notNull().default(0),
  tags: jsonb('tags').$type<string[]>().notNull().default([]),
});

export const storageFiles = pgTable('storage_files', {
  id: text('id').primaryKey(),
  designId: text('design_id').notNull(),
  fileType: text('file_type').notNull(), // 'preview' | 'cad'
  filename: text('filename').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  dataBase64: text('data_base64').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const contactMessages = pgTable('contact_messages', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  subject: text('subject').notNull(),
  message: text('message').notNull(),
  status: text('status').notNull().default('new'),
  createdAt: text('created_at').notNull(),
});

export const designsRelations = relations(designs, ({ many }) => ({
  files: many(storageFiles),
}));

export const storageFilesRelations = relations(storageFiles, ({ one }) => ({
  design: one(designs, {
    fields: [storageFiles.designId],
    references: [designs.id],
  }),
}));
