import type { CADDesign, Category, DesignReview, User } from '../types.ts';

export const DEFAULT_PREVIEW_IMAGE = '/src/assets/images/cad_electrical_panel_1795206880418.jpg';

export function sanitizePreviewUrl(url: unknown): string {
  if (typeof url !== 'string') return DEFAULT_PREVIEW_IMAGE;
  const trimmed = url.trim();
  if (!trimmed) return DEFAULT_PREVIEW_IMAGE;
  if (
    trimmed.startsWith('/src/assets/images/') ||
    /^\/api\/designs\/[a-zA-Z0-9_-]+\/preview(\?.*)?$/.test(trimmed)
  ) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    // Reject relative traversal or non-HTTP schemes (e.g. javascript:, data:)
  }
  return DEFAULT_PREVIEW_IMAGE;
}

export function recalculateDesignRating(reviews: DesignReview[]): {
  rating: number;
  reviewsCount: number;
} {
  if (!Array.isArray(reviews) || reviews.length === 0) {
    return { rating: 5.0, reviewsCount: 0 };
  }
  const sum = reviews.reduce((acc, r) => acc + Math.min(5, Math.max(1, Number(r.rating) || 5)), 0);
  const avg = Math.round((sum / reviews.length) * 10) / 10;
  return { rating: avg, reviewsCount: reviews.length };
}

export interface DesignFilterParams {
  search?: string;
  category?: string;
  software?: string;
  format?: string;
  complexity?: string;
  sort?: string;
  status?: string;
}

export function filterAndSortDesigns(
  designs: CADDesign[],
  filters: DesignFilterParams
): CADDesign[] {
  let result = [...designs];
  const { search, category, software, format, complexity, sort, status } = filters;

  if (status === 'all') {
    // keep all statuses (published and draft)
  } else if (status) {
    result = result.filter((d) => d.status === status);
  } else {
    result = result.filter((d) => d.status === 'published');
  }

  if (search && typeof search === 'string' && search.trim() !== '') {
    const q = search.trim().toLowerCase();
    result = result.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q) ||
        d.tags.some((t) => t.toLowerCase().includes(q)) ||
        d.software.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q) ||
        d.format.toLowerCase().includes(q)
    );
  }

  if (category && category !== 'All') {
    result = result.filter((d) => d.category === category);
  }

  if (software && software !== 'All') {
    result = result.filter((d) => d.software === software);
  }

  if (format && format !== 'All') {
    result = result.filter((d) => d.format === format);
  }

  if (complexity && complexity !== 'All') {
    result = result.filter((d) => d.complexity === complexity);
  }

  if (sort === 'downloads') {
    result.sort((a, b) => b.downloadsCount - a.downloadsCount);
  } else if (sort === 'rating') {
    result.sort((a, b) => b.rating - a.rating || b.reviewsCount - a.reviewsCount);
  } else if (sort === 'oldest') {
    result.sort(
      (a, b) => new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime()
    );
  } else if (sort === 'order') {
    result.sort(
      (a, b) =>
        (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)
    );
  } else {
    result.sort(
      (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );
  }

  return result;
}

export function validateDesignPayload(payload: Partial<CADDesign>): {
  valid: boolean;
  error?: string;
} {
  if (!payload.title || typeof payload.title !== 'string' || !payload.title.trim()) {
    return { valid: false, error: 'Design title is required.' };
  }
  if (
    !payload.description ||
    typeof payload.description !== 'string' ||
    !payload.description.trim()
  ) {
    return { valid: false, error: 'Design description is required.' };
  }
  if (!payload.fileSize || typeof payload.fileSize !== 'string' || !payload.fileSize.trim()) {
    return { valid: false, error: 'File size is required.' };
  }
  return { valid: true };
}

export function isValidEmail(email: string): boolean {
  if (typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function slugifyCategory(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function generateDXFContent(design: CADDesign): string {
  const safeTitle = design.title.replace(/[\r\n]+/g, ' ').slice(0, 72);
  const safeMeta = `${design.software} | ${design.format} | ${design.category} | ${design.complexity}`;
  const safeAuthor = `Uploaded by: ${design.uploadedBy} (${design.uploadedAt})`;

  return [
    '0',
    'SECTION',
    '2',
    'HEADER',
    '9',
    '$ACADVER',
    '1',
    'AC1015',
    '0',
    'ENDSEC',
    '0',
    'SECTION',
    '2',
    'ENTITIES',
    // Outer drawing frame (A3-style schematic frame)
    '0',
    'LWPOLYLINE',
    '8',
    'FRAME',
    '90',
    '4',
    '70',
    '1',
    '10',
    '0.0',
    '20',
    '0.0',
    '10',
    '420.0',
    '20',
    '0.0',
    '10',
    '420.0',
    '20',
    '297.0',
    '10',
    '0.0',
    '20',
    '297.0',
    // Title block divider
    '0',
    'LINE',
    '8',
    'TITLEBLOCK',
    '10',
    '240.0',
    '20',
    '0.0',
    '11',
    '240.0',
    '21',
    '45.0',
    '0',
    'LINE',
    '8',
    'TITLEBLOCK',
    '10',
    '240.0',
    '20',
    '45.0',
    '11',
    '420.0',
    '21',
    '45.0',
    // Reference circle & schematic bus lines
    '0',
    'CIRCLE',
    '8',
    'SCHEMATIC',
    '10',
    '140.0',
    '20',
    '160.0',
    '40',
    '48.0',
    '0',
    'LINE',
    '8',
    'SCHEMATIC',
    '10',
    '40.0',
    '20',
    '160.0',
    '11',
    '360.0',
    '21',
    '160.0',
    // Title block text
    '0',
    'TEXT',
    '8',
    'ANNOTATIONS',
    '10',
    '246.0',
    '20',
    '30.0',
    '40',
    '5.5',
    '1',
    safeTitle,
    '0',
    'TEXT',
    '8',
    'ANNOTATIONS',
    '10',
    '246.0',
    '20',
    '18.0',
    '40',
    '3.5',
    '1',
    safeMeta,
    '0',
    'TEXT',
    '8',
    'ANNOTATIONS',
    '10',
    '246.0',
    '20',
    '8.0',
    '40',
    '3.0',
    '1',
    safeAuthor,
    '0',
    'ENDSEC',
    '0',
    'EOF',
    '',
  ].join('\n');
}

function escapePdfText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

export function generatePDFBuffer(design: CADDesign): Buffer {
  const lines = [
    'SPARK CAT - VERIFIED ENGINEERING CAD SPECIFICATION',
    `Title: ${design.title}`,
    `Category: ${design.category}`,
    `Software: ${design.software} | Format: ${design.format}`,
    `Complexity: ${design.complexity} | Size: ${design.fileSize}`,
    `Author: ${design.uploadedBy} | Date: ${design.uploadedAt}`,
    `Tags: ${design.tags.join(', ')}`,
    '----------------------------------------------------------------',
    ...design.description.match(/.{1,78}(\s|$)/g)?.map((s) => s.trim()) || [design.description],
  ];

  const textOps = lines
    .map((line, idx) => {
      const y = 740 - idx * 18;
      const fontSize = idx === 0 ? 14 : idx === 1 ? 12 : 10;
      return `BT /F1 ${fontSize} Tf 50 ${y} Td (${escapePdfText(line)}) Tj ET`;
    })
    .join('\n');

  const streamContent = `${textOps}\n`;
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n',
    `4 0 obj << /Length ${Buffer.byteLength(streamContent, 'utf8')} >> stream\n${streamContent}endstream endobj\n`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf8');
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function createStoredZip(entries: { name: string; data: Buffer }[]): Buffer {
  const localChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(0, 8); // compression: store
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(size, 18);
    localHeader.writeUInt32LE(size, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localChunks.push(localHeader, nameBuf, entry.data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(size, 20);
    centralHeader.writeUInt32LE(size, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralChunks.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + size;
  }

  const centralDir = Buffer.concat(centralChunks);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralDir.length, 12);
  endRecord.writeUInt32LE(offset, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...localChunks, centralDir, endRecord]);
}

export function buildDownloadableCadFile(design: CADDesign): {
  filename: string;
  mimeType: string;
  buffer: Buffer;
} {
  const slug = slugifyCategory(design.title) || design.id;

  if (design.format === 'PDF') {
    return {
      filename: `${slug}.pdf`,
      mimeType: 'application/pdf',
      buffer: generatePDFBuffer(design),
    };
  }

  if (design.format === 'ZIP') {
    const dxfBuf = Buffer.from(generateDXFContent(design), 'utf8');
    const readmeBuf = Buffer.from(
      [
        `Spark Cat CAD Design Package`,
        `============================`,
        `Title: ${design.title}`,
        `Category: ${design.category}`,
        `Software: ${design.software}`,
        `Complexity: ${design.complexity}`,
        `Uploaded By: ${design.uploadedBy} on ${design.uploadedAt}`,
        `Tags: ${design.tags.join(', ')}`,
        ``,
        `Description:`,
        design.description,
      ].join('\n'),
      'utf8'
    );
    return {
      filename: `${slug}.zip`,
      mimeType: 'application/zip',
      buffer: createStoredZip([
        { name: `${slug}.dxf`, data: dxfBuf },
        { name: 'README.txt', data: readmeBuf },
      ]),
    };
  }

  // DXF, DWG, EPLAN -> valid ASCII DXF schematic file
  const ext = design.format === 'DWG' ? 'dxf' : design.format.toLowerCase();
  return {
    filename: `${slug}.${ext}`,
    mimeType: 'application/dxf',
    buffer: Buffer.from(generateDXFContent(design), 'utf8'),
  };
}

export function createResetPlatformState<TUser extends User>(
  defaultCategories: Category[],
  defaultUsers: TUser[]
): {
  designs: CADDesign[];
  categories: Category[];
  users: TUser[];
} {
  return {
    designs: [],
    categories: defaultCategories.map((c) => ({ ...c })),
    users: defaultUsers.map((u) => ({
      ...u,
      favorites: [],
      downloadHistory: [],
    })),
  };
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '1.0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function parseDroppedCadFileMeta(
  fileName: string,
  sizeBytes: number
): {
  title: string;
  format: CADDesign['format'];
  software: CADDesign['software'];
  category: string;
  fileSize: string;
  description: string;
  tags: string[];
  previewUrl: string;
} {
  const cleanName = fileName.trim() || 'Untitled_CAD_Design.dwg';
  const lastDot = cleanName.lastIndexOf('.');
  const ext = lastDot > 0 ? cleanName.slice(lastDot + 1).toLowerCase() : 'dwg';
  const base = lastDot > 0 ? cleanName.slice(0, lastDot) : cleanName;

  const title = base
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase()) || 'Untitled CAD Design';

  let format: CADDesign['format'] = 'DWG';
  if (ext === 'dxf') format = 'DXF';
  else if (ext === 'pdf') format = 'PDF';
  else if (ext === 'zip') format = 'ZIP';
  else if (ext === 'eplan' || ext === 'epj' || ext === 'zw1') format = 'EPLAN';

  const lower = cleanName.toLowerCase();
  let category = 'Electrical Engineering';
  let previewUrl = '/src/assets/images/cad_electrical_panel_1795206880418.jpg';
  let software: CADDesign['software'] = format === 'EPLAN' ? 'EPLAN' : 'AutoCAD';

  if (/(gear|cnc|spindle|shaft|mech|solid|valve|pump)/.test(lower)) {
    category = 'Mechanical CAD';
    software = 'SolidWorks';
    previewUrl = '/src/assets/images/cad_mechanical_gearbox_1795206880254.jpg';
  } else if (/(plc|robot|sensor|automation|scada|conveyor)/.test(lower)) {
    category = 'Industrial Automation';
    software = format === 'EPLAN' ? 'EPLAN' : 'AutoCAD';
    previewUrl = '/src/assets/images/cad_plc_automation_1795206880446.jpg';
  } else if (/(hvac|mep|floor|arch|building|revit|duct)/.test(lower)) {
    category = 'Architectural & MEP';
    software = 'Revit';
    previewUrl = '/src/assets/images/cad_mep_hvac_1795206880519.jpg';
  } else if (/(solar|pv|inverter|photovoltaic|panel_array)/.test(lower)) {
    category = 'Solar & Renewable';
    software = 'AutoCAD';
    previewUrl = '/src/assets/images/cad_solar_pv_1795206880202.jpg';
  }

  const tags = Array.from(
    new Set([
      format,
      software,
      ...title
        .split(' ')
        .filter((w) => w.length > 2)
        .slice(0, 3),
    ])
  );

  return {
    title,
    format,
    software,
    category,
    fileSize: formatFileSize(sizeBytes),
    description: `Uploaded ${format} CAD design package (${cleanName}) for ${category}.`,
    tags,
    previewUrl,
  };
}

export function moveItemInArray<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return [...items];
  }
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function reorderDesignsByIds(designs: CADDesign[], orderedIds: string[]): CADDesign[] {
  const byId = new Map(designs.map((d) => [d.id, d]));
  const seen = new Set<string>();
  const reordered: CADDesign[] = [];

  for (const id of orderedIds) {
    const found = byId.get(id);
    if (found && !seen.has(id)) {
      seen.add(id);
      reordered.push(found);
    }
  }

  for (const d of designs) {
    if (!seen.has(d.id)) {
      reordered.push(d);
    }
  }

  return reordered.map((d, idx) => ({ ...d, order: idx }));
}
