import { CADDesign, User as AppUser } from '../types';
import { Download, Heart, Star, ArrowLeft, Calendar, User, FileCode, HardDrive, ShieldCheck, Cpu, Share2, Check, MessageSquare, Trash2 } from 'lucide-react';
import React, { useState } from 'react';

interface DesignDetailProps {
  design: CADDesign;
  currentUser: AppUser | null;
  onBack: () => void;
  onDownload: (design: CADDesign) => void;
  isFavorite: boolean;
  onToggleFavorite: (designId: string) => void;
  onOpenAuth: () => void;
  onSubmitReview?: (designId: string, rating: number, comment: string) => Promise<{ success: boolean; error?: string }>;
  onDeleteReview?: (designId: string, reviewId: string) => Promise<void>;
  allDesigns: CADDesign[];
  onSelectDesign: (d: CADDesign) => void;
}

const FALLBACK_PREVIEW = '/src/assets/images/cad_electrical_panel_1795206880418.jpg';

export function DesignDetail({
  design,
  currentUser,
  onBack,
  onDownload,
  isFavorite,
  onToggleFavorite,
  onOpenAuth,
  onSubmitReview,
  onDeleteReview,
  allDesigns,
  onSelectDesign
}: DesignDetailProps) {
  const [copied, setCopied] = useState(false);
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState<string>('');
  const [reviewError, setReviewError] = useState<string>('');
  const [submittingReview, setSubmittingReview] = useState<boolean>(false);

  const reviews = Array.isArray(design.reviews) ? design.reviews : [];

  const handleShare = async () => {
    const url = `${window.location.origin}/?design=${encodeURIComponent(design.id)}`;
    let success = false;
    try {
      await navigator.clipboard.writeText(url);
      success = true;
    } catch {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = url;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        success = document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch {
        success = false;
      }
    }
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSubmitReview) return;
    setReviewError('');
    if (!reviewComment.trim()) {
      setReviewError('Please enter a brief review comment.');
      return;
    }
    setSubmittingReview(true);
    try {
      const res = await onSubmitReview(design.id, reviewRating, reviewComment.trim());
      if (res.success) {
        setReviewComment('');
      } else {
        setReviewError(res.error || 'Could not submit review.');
      }
    } finally {
      setSubmittingReview(false);
    }
  };

  const relatedDesigns = allDesigns
    .filter(d => d.id !== design.id && (d.category === design.category || d.software === design.software))
    .slice(0, 3);

  return (
    <div className="min-h-screen bg-slate-50 py-6 sm:py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Back Button */}
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:border-slate-300 px-4 py-2.5 min-h-[44px] rounded-lg mb-5 sm:mb-8 transition-colors text-xs font-semibold shadow-xs"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Library</span>
        </button>

        {/* Mobile order: 1. Preview -> 2. Title, Download & Specs -> 3. Overview & Tags */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 items-start">
          {/* Block 1: Main Preview Image */}
          <div className="order-1 lg:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs relative">
            <div className="relative h-[240px] sm:h-[380px] lg:h-[440px] w-full bg-slate-100">
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
                className="w-full h-full object-cover"
              />

              <div className="absolute top-3 right-3 sm:top-4 sm:right-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleShare}
                  aria-label="Share design link"
                  className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 p-2.5 flex items-center justify-center bg-white/95 hover:bg-white text-slate-700 rounded-lg border border-slate-200 transition-colors shadow-xs"
                  title="Share Design Link"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Share2 className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => onToggleFavorite(design.id)}
                  aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                  className={`min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 p-2.5 flex items-center justify-center rounded-lg border transition-colors shadow-xs ${
                    isFavorite
                      ? 'bg-rose-600 text-white border-rose-600'
                      : 'bg-white/95 text-slate-700 hover:text-slate-900 border-slate-200'
                  }`}
                  title={isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
                >
                  <Heart className={`w-4 h-4 ${isFavorite ? 'fill-white' : ''}`} />
                </button>
              </div>
            </div>
          </div>

          {/* Block 2: Title, Download CTA & Technical Specifications (2nd on mobile, Right sidebar on desktop) */}
          <div className="order-2 lg:col-start-3 lg:row-start-1 lg:row-span-2 bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-xs">
            <div className="flex items-center justify-between gap-2 text-xs mb-3">
              <span className="font-semibold text-blue-700">
                {design.category}
              </span>
              <div className="flex items-center gap-1 text-slate-700 font-semibold tabular-nums shrink-0">
                <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                <span>{design.rating}</span>
                <span className="text-slate-400 font-normal">({design.reviewsCount})</span>
              </div>
            </div>

            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 mb-2 leading-tight">
              {design.title}
            </h1>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 mb-5 sm:mb-6 font-mono">
              <span>{design.software}</span>
              <span aria-hidden="true">·</span>
              <span>{design.format}</span>
              <span aria-hidden="true">·</span>
              <span>{design.fileSize}</span>
            </div>

            {/* Download Button */}
            <button
              type="button"
              onClick={() => onDownload(design)}
              className="w-full min-h-[48px] bg-blue-700 hover:bg-blue-800 text-white font-semibold py-3.5 px-5 rounded-lg transition-colors flex items-center justify-center gap-2.5 mb-6 text-sm"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>Download CAD File ({design.fileSize})</span>
            </button>

            {/* Technical Specifications List */}
            <div className="space-y-1 pt-4 border-t border-slate-200">
              <h3 className="text-xs font-semibold text-slate-500 mb-3">Technical Specifications</h3>

              <div className="flex items-center justify-between gap-3 text-xs py-2.5 border-b border-slate-100">
                <span className="text-slate-500 flex items-center gap-2 shrink-0">
                  <FileCode className="w-4 h-4 text-slate-400" />
                  <span>Compatible Software</span>
                </span>
                <span className="font-semibold text-slate-900 text-right">{design.software}</span>
              </div>

              <div className="flex items-center justify-between gap-3 text-xs py-2.5 border-b border-slate-100">
                <span className="text-slate-500 flex items-center gap-2 shrink-0">
                  <HardDrive className="w-4 h-4 text-slate-400" />
                  <span>File Format</span>
                </span>
                <span className="font-mono font-semibold text-slate-900 text-right">{design.format}</span>
              </div>

              <div className="flex items-center justify-between gap-3 text-xs py-2.5 border-b border-slate-100">
                <span className="text-slate-500 flex items-center gap-2 shrink-0">
                  <Cpu className="w-4 h-4 text-slate-400" />
                  <span>Complexity Level</span>
                </span>
                <span className="font-semibold text-slate-900 text-right">{design.complexity}</span>
              </div>

              <div className="flex items-center justify-between gap-3 text-xs py-2.5 border-b border-slate-100">
                <span className="text-slate-500 flex items-center gap-2 shrink-0">
                  <HardDrive className="w-4 h-4 text-slate-400" />
                  <span>File Size</span>
                </span>
                <span className="font-mono font-semibold text-slate-900 tabular-nums text-right">{design.fileSize}</span>
              </div>

              <div className="flex items-center justify-between gap-3 text-xs py-2.5 border-b border-slate-100">
                <span className="text-slate-500 flex items-center gap-2 shrink-0">
                  <Download className="w-4 h-4 text-slate-400" />
                  <span>Total Downloads</span>
                </span>
                <span className="font-mono font-semibold text-slate-900 tabular-nums text-right">{design.downloadsCount.toLocaleString()}</span>
              </div>

              <div className="flex items-center justify-between gap-3 text-xs py-2.5 border-b border-slate-100">
                <span className="text-slate-500 flex items-center gap-2 shrink-0">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  <span>Upload Date</span>
                </span>
                <span className="font-mono font-semibold text-slate-900 tabular-nums text-right">{design.uploadedAt}</span>
              </div>

              <div className="flex items-center justify-between gap-3 text-xs py-2.5">
                <span className="text-slate-500 flex items-center gap-2 shrink-0">
                  <User className="w-4 h-4 text-slate-400" />
                  <span>Uploaded By</span>
                </span>
                <span className="font-semibold text-slate-900 text-right truncate">{design.uploadedBy}</span>
              </div>
            </div>

            <div className="mt-5 bg-slate-50 border border-slate-200 rounded-lg p-3.5 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-600 leading-relaxed">
                Verified engineering CAD file tested for software compatibility and industry drafting standards.
              </p>
            </div>
          </div>

          {/* Block 3: Full Description, Tags & Engineering Reviews (3rd on mobile, below Preview on desktop) */}
          <div className="order-3 lg:col-span-2 space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-8 shadow-xs">
              <h2 className="text-lg font-bold text-slate-900 mb-3">Design Overview & Scope</h2>
              <p className="text-slate-700 text-sm sm:text-base leading-relaxed mb-6">
                {design.description}
              </p>

              {design.tags.length > 0 && (
                <div className="pt-4 border-t border-slate-100">
                  <h3 className="text-xs font-semibold text-slate-500 mb-2">Engineering Tags</h3>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-600 font-mono">
                    {design.tags.map((tag, idx) => (
                      <span key={tag} className="inline-flex items-center gap-3">
                        <span>{tag}</span>
                        {idx < design.tags.length - 1 && (
                          <span aria-hidden="true" className="text-slate-300">·</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Ratings & Engineering Reviews */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-8 shadow-xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-blue-700" />
                  <h2 className="text-lg font-bold text-slate-900">Engineering Reviews</h2>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 tabular-nums">
                  <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                  <span>{design.rating}</span>
                  <span className="text-slate-400 font-normal">
                    ({reviews.length} {reviews.length === 1 ? 'review' : 'reviews'})
                  </span>
                </div>
              </div>

              {currentUser ? (
                <form onSubmit={handleReviewSubmit} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-700">Rate this CAD design</span>
                    <div className="flex items-center gap-1" role="radiogroup" aria-label="Star rating">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setReviewRating(star)}
                          aria-label={`Rate ${star} out of 5 stars`}
                          className="p-1.5 rounded-md hover:bg-white transition-colors"
                        >
                          <Star
                            className={`w-5 h-5 ${
                              star <= reviewRating
                                ? 'text-amber-500 fill-amber-500'
                                : 'text-slate-300'
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    rows={3}
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    placeholder="Share technical feedback on layer structure, accuracy, or compatibility..."
                    className="w-full bg-white text-slate-900 text-xs sm:text-sm rounded-lg p-3 border border-slate-300 focus:outline-none focus:border-blue-700 focus:ring-1 focus:ring-blue-700"
                    required
                  />
                  {reviewError && (
                    <p role="alert" className="text-xs text-red-600 font-medium">
                      {reviewError}
                    </p>
                  )}
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={submittingReview}
                      className="w-full sm:w-auto min-h-[40px] bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
                    >
                      {submittingReview ? 'Submitting...' : 'Post Review'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <p className="text-xs text-slate-600">
                    Sign in to rate this schematic and share engineering notes with the community.
                  </p>
                  <button
                    type="button"
                    onClick={onOpenAuth}
                    className="w-full sm:w-auto min-h-[40px] bg-white hover:bg-slate-100 text-slate-900 border border-slate-300 text-xs font-semibold px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
                  >
                    Sign In to Review
                  </button>
                </div>
              )}

              {reviews.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {reviews.map((rev) => {
                    const canDelete =
                      currentUser && (currentUser.id === rev.userId || currentUser.role === 'admin');
                    return (
                      <div key={rev.id} className="py-4 first:pt-0 last:pb-0 space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-xs font-bold text-slate-900">{rev.userName}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <div className="flex items-center gap-0.5" aria-label={`${rev.rating} out of 5 stars`}>
                                {[1, 2, 3, 4, 5].map((s) => (
                                  <Star
                                    key={s}
                                    className={`w-3.5 h-3.5 ${
                                      s <= rev.rating ? 'text-amber-500 fill-amber-500' : 'text-slate-200'
                                    }`}
                                  />
                                ))}
                              </div>
                              <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                                {rev.createdAt}
                              </span>
                            </div>
                          </div>
                          {canDelete && onDeleteReview && (
                            <button
                              type="button"
                              onClick={() => onDeleteReview(design.id, rev.id)}
                              aria-label="Delete review"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">{rev.comment}</p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-500 text-center py-4">
                  No engineering reviews yet. Be the first to review this CAD file.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Related Designs Section */}
        {relatedDesigns.length > 0 && (
          <div className="mt-10 sm:mt-14">
            <h2 className="text-xl font-bold text-slate-900 mb-5 sm:mb-6">Related Engineering Designs</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
              {relatedDesigns.map((rd) => (
                <button
                  type="button"
                  key={rd.id}
                  onClick={() => onSelectDesign(rd)}
                  className="text-left bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-4 cursor-pointer transition-all shadow-xs hover:shadow-sm group"
                >
                  <div className="h-36 rounded-lg overflow-hidden mb-3 bg-slate-100">
                    <img
                      src={rd.previewUrl || FALLBACK_PREVIEW}
                      alt={rd.title}
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        const target = e.currentTarget;
                        if (target.src !== window.location.origin + FALLBACK_PREVIEW) {
                          target.src = FALLBACK_PREVIEW;
                        }
                      }}
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform"
                    />
                  </div>
                  <div className="text-xs text-slate-500 font-mono">
                    <span className="text-blue-700 font-sans font-semibold">{rd.software}</span> · {rd.format}
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 group-hover:text-blue-700 transition-colors line-clamp-1 mt-1">
                    {rd.title}
                  </h4>
                  <div className="flex items-center justify-between text-xs text-slate-500 mt-2 tabular-nums">
                    <span>{rd.fileSize}</span>
                    <span className="text-slate-700 font-semibold flex items-center gap-1">
                      <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                      {rd.rating}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
