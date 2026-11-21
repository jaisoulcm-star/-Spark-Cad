import { CADDesign } from '../types';
import { Download, Eye, Heart, Star } from 'lucide-react';

interface DesignCardProps {
  design: CADDesign;
  onSelect: (design: CADDesign) => void;
  onDownload: (design: CADDesign, e: React.MouseEvent) => void;
  isFavorite: boolean;
  onToggleFavorite: (designId: string, e: React.MouseEvent) => void;
}

const FALLBACK_PREVIEW = '/src/assets/images/cad_electrical_panel_1795206880418.jpg';

export function DesignCard({
  design,
  onSelect,
  onDownload,
  isFavorite,
  onToggleFavorite
}: DesignCardProps) {
  return (
    <article className="group bg-white border border-slate-200 hover:border-slate-300 rounded-xl overflow-hidden shadow-xs hover:shadow-md transition-all duration-200 flex flex-col">
      {/* Preview Image Container */}
      <div className="relative h-48 w-full overflow-hidden bg-slate-100 border-b border-slate-100">
        <button
          type="button"
          onClick={() => onSelect(design)}
          aria-label={`Open ${design.title}`}
          className="w-full h-full block text-left"
        >
          <img
            src={design.previewUrl || FALLBACK_PREVIEW}
            alt={design.title}
            referrerPolicy="no-referrer"
            onError={(e) => {
              const target = e.currentTarget;
              if (target.src !== window.location.origin + FALLBACK_PREVIEW) {
                target.src = FALLBACK_PREVIEW;
              }
            }}
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
          />
        </button>

        {/* Favorite Button */}
        <button
          type="button"
          onClick={(e) => onToggleFavorite(design.id, e)}
          aria-label={isFavorite ? `Remove ${design.title} from favorites` : `Add ${design.title} to favorites`}
          className={`absolute top-3 right-3 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:p-2 flex items-center justify-center rounded-lg border transition-colors ${
            isFavorite
              ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
              : 'bg-white/95 text-slate-600 hover:text-slate-900 border-slate-200 shadow-xs'
          }`}
          title={isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
        >
          <Heart className={`w-4 h-4 ${isFavorite ? 'fill-white' : ''}`} />
        </button>
      </div>

      {/* Content Section */}
      <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between">
        <div>
          {/* Clean unboxed metadata kicker */}
          <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-2">
            <div className="flex items-center gap-1.5 min-w-0 truncate">
              <span className="font-semibold text-blue-700">{design.software}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono font-medium text-slate-700">{design.format}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums truncate">{design.fileSize}</span>
            </div>
            <div className="flex items-center gap-1 text-slate-700 font-semibold shrink-0 tabular-nums">
              <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
              <span>{design.rating}</span>
            </div>
          </div>

          <h3 className="text-base font-bold text-slate-900 group-hover:text-blue-700 transition-colors line-clamp-2 mb-1.5">
            <button
              type="button"
              onClick={() => onSelect(design)}
              className="text-left focus:outline-none focus-visible:underline"
            >
              {design.title}
            </button>
          </h3>

          <div className="text-xs text-slate-500 mb-3 flex items-center gap-1.5">
            <span className="truncate">{design.category}</span>
            <span aria-hidden="true">·</span>
            <span className="shrink-0">{design.complexity}</span>
          </div>

          <p className="text-xs text-slate-600 line-clamp-2 mb-4 leading-relaxed">
            {design.description}
          </p>
        </div>

        {/* Footer info & Buttons */}
        <div className="pt-3.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 mt-auto">
          <div className="flex items-center gap-1.5 text-slate-500 text-xs tabular-nums">
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-semibold text-slate-700">{design.downloadsCount.toLocaleString()}</span>
            <span>downloads</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(design);
              }}
              aria-label={`View details for ${design.title}`}
              className="min-h-[40px] min-w-[40px] sm:min-h-0 sm:min-w-0 sm:p-2 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 rounded-lg border border-slate-200 transition-colors text-xs font-semibold flex items-center justify-center"
              title="View Details"
            >
              <Eye className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => onDownload(design, e)}
              aria-label={`Download ${design.title}`}
              className="min-h-[40px] sm:min-h-0 bg-blue-700 hover:bg-blue-800 text-white px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download</span>
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
