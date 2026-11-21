import test from 'node:test';
import assert from 'node:assert/strict';
import type { CADDesign } from '../types';
import {
  filterAndSortDesigns,
  validateDesignPayload,
  isValidEmail,
  slugifyCategory,
  buildDownloadableCadFile,
  createResetPlatformState,
  parseDroppedCadFileMeta,
  moveItemInArray,
  reorderDesignsByIds,
  sanitizePreviewUrl,
  recalculateDesignRating,
  DEFAULT_PREVIEW_IMAGE,
} from './cadHelpers';

const sampleDesigns: CADDesign[] = [
  {
    id: 'des-1',
    title: '480V Motor Control Center',
    description: 'Three-phase MCC schematic with VFD feeders.',
    category: 'Electrical Engineering',
    software: 'EPLAN',
    format: 'EPLAN',
    complexity: 'Advanced',
    fileSize: '14.2 MB',
    previewUrl: '/src/assets/images/test.jpg',
    downloadUrl: '/api/designs/des-1/file',
    downloadsCount: 1250,
    rating: 4.9,
    reviewsCount: 42,
    uploadedBy: 'Spark Cat Admin',
    uploadedAt: '2026-11-10',
    status: 'published',
    tags: ['MCC', 'VFD', '480V'],
  },
  {
    id: 'des-2',
    title: 'Planetary Reduction Gearbox',
    description: 'Cutaway helical gear assembly.',
    category: 'Mechanical CAD',
    software: 'SolidWorks',
    format: 'ZIP',
    complexity: 'Intermediate',
    fileSize: '28.6 MB',
    previewUrl: '/src/assets/images/test2.jpg',
    downloadUrl: '/api/designs/des-2/file',
    downloadsCount: 980,
    rating: 4.8,
    reviewsCount: 31,
    uploadedBy: 'Alex Mercer',
    uploadedAt: '2026-11-15',
    status: 'published',
    tags: ['Gearbox', 'Mechanical'],
  },
  {
    id: 'des-draft',
    title: 'Internal Prototype Substation',
    description: 'Draft switchgear layout pending review.',
    category: 'Electrical Engineering',
    software: 'AutoCAD',
    format: 'DWG',
    complexity: 'Advanced',
    fileSize: '8.4 MB',
    previewUrl: '/src/assets/images/test3.jpg',
    downloadUrl: '/api/designs/des-draft/file',
    downloadsCount: 0,
    rating: 5.0,
    reviewsCount: 1,
    uploadedBy: 'Spark Cat Admin',
    uploadedAt: '2026-11-19',
    status: 'draft',
    tags: ['Draft', 'Substation'],
  },
];

test('filterAndSortDesigns hides drafts by default and reveals them with status=all', () => {
  const publicList = filterAndSortDesigns(sampleDesigns, {});
  assert.equal(publicList.length, 2);
  assert.equal(publicList[0].id, 'des-2'); // latest first

  const adminList = filterAndSortDesigns(sampleDesigns, { status: 'all' });
  assert.equal(adminList.length, 3);
});

test('filterAndSortDesigns filters by search, software, category, and sorts by downloads', () => {
  const searched = filterAndSortDesigns(sampleDesigns, { search: 'VFD' });
  assert.equal(searched.length, 1);
  assert.equal(searched[0].id, 'des-1');

  const sortedByDownloads = filterAndSortDesigns(sampleDesigns, { sort: 'downloads' });
  assert.equal(sortedByDownloads[0].id, 'des-1');

  const swFiltered = filterAndSortDesigns(sampleDesigns, { software: 'SolidWorks' });
  assert.equal(swFiltered.length, 1);
  assert.equal(swFiltered[0].id, 'des-2');
});

test('validateDesignPayload rejects blank title or description', () => {
  assert.equal(validateDesignPayload({ title: '', description: 'ok', fileSize: '1 MB' }).valid, false);
  assert.equal(validateDesignPayload({ title: 'Panel', description: '   ', fileSize: '1 MB' }).valid, false);
  assert.equal(validateDesignPayload({ title: 'Panel', description: 'Valid spec', fileSize: '4.5 MB' }).valid, true);
});

test('isValidEmail and slugifyCategory work properly', () => {
  assert.equal(isValidEmail('engineer@sparkcat.com'), true);
  assert.equal(isValidEmail('not-an-email'), false);
  assert.equal(slugifyCategory('Solar & Renewable'), 'solar-renewable');
});

test('buildDownloadableCadFile produces valid DXF, PDF, and ZIP buffers', () => {
  const dxf = buildDownloadableCadFile(sampleDesigns[0]);
  assert.match(dxf.buffer.toString('utf8'), /SECTION[\s\S]*ENTITIES[\s\S]*EOF/);

  const zip = buildDownloadableCadFile(sampleDesigns[1]);
  assert.equal(zip.filename.endsWith('.zip'), true);
  // PK\x03\x04 local file header signature
  assert.equal(zip.buffer.readUInt32LE(0), 0x04034b50);

  const pdfDesign: CADDesign = { ...sampleDesigns[0], format: 'PDF' };
  const pdf = buildDownloadableCadFile(pdfDesign);
  assert.equal(pdf.filename.endsWith('.pdf'), true);
  assert.equal(pdf.buffer.toString('utf8').startsWith('%PDF-1.4'), true);
});

test('createResetPlatformState clears designs and user activity while cloning default categories and users', () => {
  const defaultCats = [
    { id: '1', name: 'Electrical Engineering', slug: 'electrical', description: 'Power schematics', iconName: 'Zap' },
  ];
  const defaultUsers = [
    {
      id: 'usr-admin',
      name: 'Spark Cat Admin',
      email: 'admin@sparkcat.com',
      role: 'admin' as const,
      favorites: ['des-1'],
      downloadHistory: [{ designId: 'des-1', downloadedAt: '2026-11-19' }],
      createdAt: '2026-10-01',
    },
  ];

  const reset = createResetPlatformState(defaultCats, defaultUsers);
  assert.deepEqual(reset.designs, []);
  assert.equal(reset.categories.length, 1);
  assert.notEqual(reset.categories[0], defaultCats[0]);
  assert.equal(reset.users.length, 1);
  assert.deepEqual(reset.users[0].favorites, []);
  assert.deepEqual(reset.users[0].downloadHistory, []);
});

test('parseDroppedCadFileMeta extracts title, format, category, and size from dropped filenames', () => {
  const gearbox = parseDroppedCadFileMeta('planetary_gearbox_v2.zip', 2_500_000);
  assert.equal(gearbox.title, 'Planetary Gearbox V2');
  assert.equal(gearbox.format, 'ZIP');
  assert.equal(gearbox.category, 'Mechanical CAD');
  assert.equal(gearbox.software, 'SolidWorks');
  assert.match(gearbox.fileSize, /MB$/);

  const eplan = parseDroppedCadFileMeta('plc_safety_cell.eplan', 512000);
  assert.equal(eplan.format, 'EPLAN');
  assert.equal(eplan.category, 'Industrial Automation');
});

test('moveItemInArray and reorderDesignsByIds reorder items cleanly and assign order indices', () => {
  const moved = moveItemInArray(['a', 'b', 'c'], 0, 2);
  assert.deepEqual(moved, ['b', 'c', 'a']);

  const reordered = reorderDesignsByIds(sampleDesigns, ['des-draft', 'des-1', 'des-2']);
  assert.deepEqual(
    reordered.map((d) => d.id),
    ['des-draft', 'des-1', 'des-2']
  );
  assert.deepEqual(
    reordered.map((d) => d.order),
    [0, 1, 2]
  );

  const sortedByOrder = filterAndSortDesigns(reordered, { status: 'all', sort: 'order' });
  assert.deepEqual(
    sortedByOrder.map((d) => d.id),
    ['des-draft', 'des-1', 'des-2']
  );
});

test('sanitizePreviewUrl blocks unsafe schemes and preserves safe asset, API, and HTTPS URLs', () => {
  assert.equal(sanitizePreviewUrl('javascript:alert(1)'), DEFAULT_PREVIEW_IMAGE);
  assert.equal(sanitizePreviewUrl('data:text/html,<script>alert(1)</script>'), DEFAULT_PREVIEW_IMAGE);
  assert.equal(sanitizePreviewUrl('/src/assets/images/custom.jpg'), '/src/assets/images/custom.jpg');
  assert.equal(sanitizePreviewUrl('/api/designs/des-1/preview'), '/api/designs/des-1/preview');
  assert.equal(sanitizePreviewUrl('https://cdn.example.com/cad-preview.png'), 'https://cdn.example.com/cad-preview.png');
  assert.equal(sanitizePreviewUrl('   '), DEFAULT_PREVIEW_IMAGE);
});

test('recalculateDesignRating computes rounded average rating and review count', () => {
  const empty = recalculateDesignRating([]);
  assert.equal(empty.rating, 5.0);
  assert.equal(empty.reviewsCount, 0);

  const scored = recalculateDesignRating([
    { id: 'r1', userId: 'u1', userName: 'Alex', rating: 5, comment: 'Clean schematic', createdAt: '2026-11-20' },
    { id: 'r2', userId: 'u2', userName: 'Sam', rating: 4, comment: 'Good layers', createdAt: '2026-11-20' },
  ]);
  assert.equal(scored.rating, 4.5);
  assert.equal(scored.reviewsCount, 2);
});
