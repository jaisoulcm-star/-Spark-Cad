export interface DesignReview {
  id: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface CADDesign {
  id: string;
  title: string;
  description: string;
  category: string;
  software: 'AutoCAD' | 'EPLAN' | 'Revit' | 'SolidWorks' | 'Inventor' | 'Fusion 360';
  format: 'DWG' | 'DXF' | 'PDF' | 'EPLAN' | 'ZIP';
  complexity: 'Beginner' | 'Intermediate' | 'Advanced';
  fileSize: string;
  previewUrl: string;
  downloadUrl: string;
  downloadsCount: number;
  rating: number;
  reviewsCount: number;
  reviews?: DesignReview[];
  uploadedBy: string;
  uploadedAt: string;
  status: 'published' | 'draft';
  tags: string[];
  order?: number;
  originalFilename?: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  iconName: string;
  count?: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  favorites: string[];
  downloadHistory: { designId: string; downloadedAt: string }[];
  createdAt: string;
}

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  subject?: string;
  message: string;
  status: 'new' | 'resolved';
  createdAt: string;
}

export interface PlatformStats {
  totalDesigns: number;
  totalDownloads: number;
  totalCategories: number;
  totalUsers: number;
}
