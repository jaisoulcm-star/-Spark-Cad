import React from 'react';
import { CADDesign, Category } from '../types';
import { DesignCard } from './DesignCard';
import { Search, FolderOpen, RotateCcw } from 'lucide-react';

interface DesignLibraryProps {
  designs: CADDesign[];
  categories: Category[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedCategory: string;
  setSelectedCategory: (cat: string) => void;
  selectedSoftware: string;
  setSelectedSoftware: (sw: string) => void;
  selectedFormat: string;
  setSelectedFormat: (fmt: string) => void;
  selectedComplexity: string;
  setSelectedComplexity: (comp: string) => void;
  sortBy: string;
  setSortBy: (sort: string) => void;
  onSelectDesign: (design: CADDesign) => void;
  onDownload: (design: CADDesign, e: React.MouseEvent) => void;
  favorites: string[];
  onToggleFavorite: (designId: string, e: React.MouseEvent) => void;
  onResetFilters: () => void;
}

const SOFTWARE_OPTIONS = ['All', 'AutoCAD', 'EPLAN', 'Revit', 'SolidWorks', 'Inventor', 'Fusion 360'];
const FORMAT_OPTIONS = ['All', 'DWG', 'DXF', 'PDF', 'EPLAN', 'ZIP'];
const COMPLEXITY_OPTIONS = ['All', 'Beginner', 'Intermediate', 'Advanced'];

export function DesignLibrary({
  designs,
  categories,
  searchQuery,
  setSearchQuery,
  selectedCategory,
  setSelectedCategory,
  selectedSoftware,
  setSelectedSoftware,
  selectedFormat,
  setSelectedFormat,
  selectedComplexity,
  setSelectedComplexity,
  sortBy,
  setSortBy,
  onSelectDesign,
  onDownload,
  favorites,
  onToggleFavorite,
  onResetFilters
}: DesignLibraryProps) {
  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    selectedCategory !== 'All' ||
    selectedSoftware !== 'All' ||
    selectedFormat !== 'All' ||
    selectedComplexity !== 'All' ||
    sortBy !== 'latest';

  return (
    <div className="min-h-screen bg-slate-50 py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-6 sm:mb-8 pb-4 sm:pb-6 border-b border-slate-200">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">CAD Design Library</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-slate-600 tabular-nums">
              {designs.length} CAD {designs.length === 1 ? 'Design' : 'Designs'} Found
            </span>
          </div>
        </div>

        {/* Search & Filter Controls */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-6 sm:mb-8 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <label htmlFor="library-search" className="sr-only">
                Search CAD designs by title, tags, software, or category
              </label>
              <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
              <input
                id="library-search"
                type="text"
                placeholder="Search by title, tags, software, or category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 text-slate-900 text-sm rounded-lg pl-10 pr-4 min-h-[44px] py-2.5 border border-slate-200 focus:bg-white focus:outline-none focus:border-blue-700 focus:ring-1 focus:ring-blue-700 transition-colors placeholder:text-slate-400"
              />
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={onResetFilters}
                className="w-full sm:w-auto min-h-[44px] px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Clear Filters</span>
              </button>
            )}
          </div>

        </div>

        {/* Designs Grid */}
        {designs.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {designs.map((design) => (
              <DesignCard
                key={design.id}
                design={design}
                onSelect={onSelectDesign}
                onDownload={onDownload}
                isFavorite={favorites.includes(design.id)}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-14 sm:py-20 px-4 bg-white border border-slate-200 rounded-xl shadow-xs">
            <FolderOpen className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-900 mb-4">No CAD Designs Found</h3>
            <button
              type="button"
              onClick={onResetFilters}
              className="w-full sm:w-auto min-h-[44px] sm:min-h-0 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs px-5 py-2.5 rounded-lg transition-colors"
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
