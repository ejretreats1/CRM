import { useState } from 'react';
import { Sparkles, Loader, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';

interface PriorityFix {
  title: string;
  impact: 'high' | 'medium' | 'low';
  description: string;
}

interface Category {
  name: string;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  score: number;
  findings: string[];
  recommendations: string[];
}

interface Analysis {
  overallScore: number;
  overallSummary: string;
  priorityFixes: PriorityFix[];
  categories: Category[];
  rewrittenTitle: string;
  rewrittenDescriptionOpening: string;
  suggestedKeywords: string[];
}

const GRADE_COLORS: Record<string, string> = {
  A: 'bg-[#0a2518] text-[#4ab57a] border-[#0a4a2a]',
  B: 'bg-[#162035] text-[#4a90d9] border-[#1e3a5a]',
  C: 'bg-[#2a1a0a] text-[#d0954a] border-[#5a3010]',
  D: 'bg-orange-100 text-orange-700 border-orange-200',
  F: 'bg-[#2a0e0e] text-[#e05c5c] border-[#5a1a1a]',
};

const IMPACT_COLORS: Record<string, string> = {
  high: 'bg-[#2a0e0e] text-[#e05c5c]',
  medium: 'bg-[#2a1a0a] text-[#d0954a]',
  low: 'bg-[#1e2d45] text-[#b8d4f0]',
};

const PROPERTY_TYPES = ['Entire home', 'Private room', 'Shared room', 'Cabin', 'Condo', 'Villa', 'Cottage', 'Townhouse', 'Bungalow', 'Loft', 'Other'];

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 8 ? 'text-emerald-500' : score >= 6 ? 'text-[#d0954a]' : 'text-[#e05c5c]';
  const bg = score >= 8 ? 'bg-[#0a2518] border-[#0a4a2a]' : score >= 6 ? 'bg-[#2a1a0a] border-[#5a3010]' : 'bg-[#2a0e0e] border-[#5a1a1a]';
  return (
    <div className={`flex flex-col items-center justify-center w-28 h-28 rounded-full border-4 ${bg}`}>
      <span className={`text-4xl font-black ${color}`}>{score}</span>
      <span className="text-xs text-[#b8d4f0] font-medium">/ 10</span>
    </div>
  );
}

function CategoryCard({ cat }: { cat: Category }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-[#1a2335] rounded-xl border border-[#1e2d45] overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#1e2d45] transition-colors text-left"
      >
        <span className={`text-sm font-bold px-2 py-0.5 rounded border ${GRADE_COLORS[cat.grade]}`}>
          {cat.grade}
        </span>
        <span className="flex-1 font-medium text-white text-sm">{cat.name}</span>
        <span className="text-xs text-[#3a5070] mr-1">{cat.score}/10</span>
        {open ? <ChevronUp size={14} className="text-[#3a5070]" /> : <ChevronDown size={14} className="text-[#3a5070]" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-[#1e2d45] pt-3">
          {cat.findings.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wider mb-1.5">Findings</p>
              <ul className="space-y-1">
                {cat.findings.map((f, i) => (
                  <li key={i} className="text-xs text-[#b8d4f0] flex gap-2">
                    <span className="text-[#3a5070] mt-0.5">•</span>{f}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {cat.recommendations.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[#4a90d9] uppercase tracking-wider mb-1.5">Recommendations</p>
              <ul className="space-y-1">
                {cat.recommendations.map((r, i) => (
                  <li key={i} className="text-xs text-[#b8d4f0] flex gap-2">
                    <span className="text-[#6ab0f5] mt-0.5 flex-shrink-0">→</span>{r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ListingOptimizer() {
  const [form, setForm] = useState({
    title: '',
    description: '',
    amenities: '',
    price: '',
    photoCount: '',
    photoNotes: '',
    propertyType: '',
    location: '',
    reviewCount: '',
    starRating: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim()) {
      setError('Title and description are required.');
      return;
    }
    setLoading(true);
    setError('');
    setAnalysis(null);
    try {
      const res = await fetch('/api/analyze-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          amenities: form.amenities || undefined,
          price: form.price || undefined,
          photoCount: form.photoCount ? Number(form.photoCount) : undefined,
          photoNotes: form.photoNotes || undefined,
          propertyType: form.propertyType || undefined,
          location: form.location || undefined,
          reviewCount: form.reviewCount ? Number(form.reviewCount) : undefined,
          starRating: form.starRating ? Number(form.starRating) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');
      setAnalysis(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  if (analysis) {
    return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Sparkles size={20} className="text-[#4a90d9]" /> Listing Analysis
            </h1>
            <p className="text-sm text-[#b8d4f0] mt-0.5 truncate max-w-lg">{form.title}</p>
          </div>
          <button
            onClick={() => setAnalysis(null)}
            className="flex items-center gap-1.5 text-sm text-[#b8d4f0] hover:text-[#4a90d9] border border-[#1e2d45] hover:border-[#4a90d9] px-3 py-2 rounded-lg transition-colors"
          >
            <RotateCcw size={14} /> Analyze Another
          </button>
        </div>

        {/* Score + Summary */}
        <div className="bg-[#1a2335] rounded-xl border border-[#1e2d45] p-5 flex items-center gap-6">
          <ScoreGauge score={analysis.overallScore} />
          <div className="flex-1">
            <p className="text-sm font-semibold text-[#b8d4f0] mb-1">Overall Score</p>
            <p className="text-sm text-[#b8d4f0] leading-relaxed">{analysis.overallSummary}</p>
          </div>
        </div>

        {/* Priority Fixes */}
        <div className="bg-[#1a2335] rounded-xl border border-[#1e2d45] p-5">
          <h2 className="font-semibold text-white mb-3">🎯 Top Priority Fixes</h2>
          <div className="space-y-3">
            {analysis.priorityFixes.map((fix, i) => (
              <div key={i} className="flex gap-3 p-3 bg-[#1e2d45] rounded-lg">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 h-fit mt-0.5 ${IMPACT_COLORS[fix.impact]}`}>
                  {fix.impact.toUpperCase()}
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{fix.title}</p>
                  <p className="text-xs text-[#b8d4f0] mt-0.5">{fix.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Category Cards */}
        <div>
          <h2 className="font-semibold text-white mb-3">Category Breakdown</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {analysis.categories.map(cat => (
              <CategoryCard key={cat.name} cat={cat} />
            ))}
          </div>
        </div>

        {/* Rewrites */}
        <div className="bg-[#1a2335] rounded-xl border border-[#1e2d45] p-5 space-y-5">
          <h2 className="font-semibold text-white">✏️ AI Rewrites</h2>

          <div>
            <p className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wider mb-2">Original Title</p>
            <p className="text-sm text-[#b8d4f0] bg-[#1e2d45] px-3 py-2 rounded-lg border border-[#1e2d45]">{form.title}</p>
            <p className="text-xs font-semibold text-[#4a90d9] uppercase tracking-wider mt-3 mb-2">Suggested Title</p>
            <p className="text-sm text-white font-medium bg-[#162035] px-3 py-2 rounded-lg border border-teal-100">{analysis.rewrittenTitle}</p>
          </div>

          <div>
            <p className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wider mb-2">Rewritten Opening</p>
            <p className="text-sm text-white bg-[#162035] px-3 py-2.5 rounded-lg border border-teal-100 leading-relaxed whitespace-pre-wrap">{analysis.rewrittenDescriptionOpening}</p>
          </div>
        </div>

        {/* Keywords */}
        <div className="bg-[#1a2335] rounded-xl border border-[#1e2d45] p-5">
          <h2 className="font-semibold text-white mb-3">🔍 SEO Keywords to Include</h2>
          <div className="flex flex-wrap gap-2">
            {analysis.suggestedKeywords.map(kw => (
              <span key={kw} className="text-xs bg-[#1a1a35] text-[#d07af5] border border-indigo-100 px-3 py-1 rounded-full font-medium">
                {kw}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Sparkles size={20} className="text-[#4a90d9]" /> Listing Optimizer
        </h1>
        <p className="text-sm text-[#b8d4f0] mt-0.5">Paste your Airbnb listing content and get AI-powered optimization recommendations.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Title + Type + Location */}
        <div className="bg-[#1a2335] rounded-xl border border-[#1e2d45] p-5 space-y-4">
          <p className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wider">Listing Basics</p>

          <div>
            <label className="block text-xs font-medium text-[#b8d4f0] mb-1">Listing Title *</label>
            <input
              required
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="e.g. Cozy Mountain Cabin with Hot Tub & Stunning Views"
              className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
            />
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#b8d4f0] mb-1">Property Type</label>
              <select
                value={form.propertyType}
                onChange={e => set('propertyType', e.target.value)}
                className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
              >
                <option value="">Select...</option>
                {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#b8d4f0] mb-1">Location / Neighborhood</label>
              <input
                value={form.location}
                onChange={e => set('location', e.target.value)}
                placeholder="e.g. Smoky Mountains, TN"
                className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#b8d4f0] mb-1">Avg. Nightly Rate <span className="text-[#3a5070] font-normal">(optional)</span></label>
              <input
                value={form.price}
                onChange={e => set('price', e.target.value)}
                placeholder="e.g. $150–$300 or skip"
                className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#b8d4f0] mb-1">Number of Reviews</label>
              <input
                type="number"
                value={form.reviewCount}
                onChange={e => set('reviewCount', e.target.value)}
                placeholder="e.g. 47"
                className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#b8d4f0] mb-1">Star Rating</label>
              <input
                type="number"
                min="1"
                max="5"
                step="0.1"
                value={form.starRating}
                onChange={e => set('starRating', e.target.value)}
                placeholder="e.g. 4.85"
                className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
              />
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="bg-[#1a2335] rounded-xl border border-[#1e2d45] p-5 space-y-4">
          <p className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wider">Description *</p>
          <textarea
            required
            value={form.description}
            onChange={e => set('description', e.target.value)}
            rows={8}
            placeholder="Paste your full Airbnb listing description here..."
            className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9] resize-none"
          />
        </div>

        {/* Amenities */}
        <div className="bg-[#1a2335] rounded-xl border border-[#1e2d45] p-5 space-y-4">
          <p className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wider">Amenities</p>
          <textarea
            value={form.amenities}
            onChange={e => set('amenities', e.target.value)}
            rows={4}
            placeholder="Paste your amenities list, one per line or comma separated...&#10;e.g. WiFi, Pool, Hot tub, Full kitchen, Washer/dryer..."
            className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9] resize-none"
          />
        </div>

        {/* Photos */}
        <div className="bg-[#1a2335] rounded-xl border border-[#1e2d45] p-5 space-y-4">
          <p className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wider">Photos</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#b8d4f0] mb-1">Total Photo Count</label>
              <input
                type="number"
                value={form.photoCount}
                onChange={e => set('photoCount', e.target.value)}
                placeholder="e.g. 24"
                className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#b8d4f0] mb-1">What's Covered</label>
              <input
                value={form.photoNotes}
                onChange={e => set('photoNotes', e.target.value)}
                placeholder="e.g. exterior, living room, kitchen, 2 bedrooms"
                className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
              />
            </div>
          </div>
        </div>

        {error && (
          <p className="text-sm text-[#e05c5c] text-center">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-[#4a90d9] hover:bg-[#3a80c9] disabled:bg-teal-300 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
        >
          {loading ? (
            <>
              <Loader size={16} className="animate-spin" />
              Analyzing listing...
            </>
          ) : (
            <>
              <Sparkles size={16} />
              Analyze Listing
            </>
          )}
        </button>
      </form>
    </div>
  );
}
