import { Search, ArrowRight } from 'lucide-react';
import { PlatformStats } from '../types';

interface HeroProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onSearchSubmit: (e: React.FormEvent) => void;
  onCategorySelect: (categoryName: string) => void;
  stats: PlatformStats | null;
  onExploreClick: () => void;
}

export function Hero({
  searchQuery,
  setSearchQuery,
  onSearchSubmit,
}: HeroProps) {
  return (
    <div className="relative overflow-hidden bg-white classic-drafting-grid py-12 sm:py-20 lg:py-28 border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center max-w-3xl mx-auto">
          {/* Main Title */}
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight leading-[1.12] mb-6 sm:mb-10 text-balance">
            Discover. Design.{' '}
            <span className="text-blue-700">Download.</span>
          </h1>

          {/* Large Search Form */}
          <form onSubmit={onSearchSubmit} className="relative max-w-2xl mx-auto">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-0 bg-white p-2 sm:p-1.5 rounded-xl border border-slate-300 shadow-sm focus-within:border-blue-700 focus-within:ring-2 focus-within:ring-blue-700/15 transition-all">
              <div className="relative flex-1 w-full flex items-center px-3 min-h-[44px]">
                <Search className="w-5 h-5 text-slate-400 mr-2.5 shrink-0" />
                <input
                  type="text"
                  aria-label="Search CAD designs"
                  placeholder="Search by title, VFD, EPLAN, DWG..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent text-slate-900 text-sm sm:text-base focus:outline-none placeholder:text-slate-400"
                />
              </div>
              <button
                type="submit"
                className="w-full sm:w-auto min-h-[44px] bg-blue-700 hover:bg-blue-800 text-white font-semibold px-6 py-2.5 sm:py-3 rounded-lg transition-colors flex items-center justify-center gap-2 shrink-0 whitespace-nowrap text-sm"
              >
                <span>Search CAD</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
