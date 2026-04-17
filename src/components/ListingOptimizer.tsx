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
  A: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  B: 'bg-teal-100 text-teal-700 border-teal-200',
  C: 'bg-amber-100 text-amber-700 border-amber-200',
  D: 'bg-orange-100 text-orange-700 border-orange-200',
  F: 'bg-red-100 text-red-700 border-red-200',
};

const IMPACT_COLORS: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-slate-100 text-slate-600',
};

const PROPERTY_TYPES = ['Entire home', 'Private room', 'Shared room', 'Cabin', 'Condo', 'Villa', 'Cottage', 'Townhouse', 'Bungalow', 'Loft', 'Other'];

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 8 ? 'text-emerald-500' : score >= 6 ? 'text-amber-500' : 'text-red-500';
  const bg = score >= 8 ? 'bg-emerald-50 border-emerald-200' : score >= 6 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200';
  return (
    <div className={`flex flex-col items-center justify-center w-28 h-28 rounded-full border-4 ${bg}`}>
      <span className={`text-4xl font-black ${color}`}>{score}</span>
      <span className="text-xs text-slate-500 font-medium">/ 10</span>
    </div>
  );
}

function CategoryCard({ cat }: { cat: Category }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
      >
        <span className={`text-sm font-bold px-2 py-0.5 rounded border ${GRADE_COLORS[cat.grade]}`}>
          {cat.grade}
        </span>
        <span className="flex-1 font-medium text-slate-800 text-sm">{cat.name}</span>
        <span className="text-xs text-slate-400 mr-1">{cat.score}/10</span>
        {open ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
          {cat.findings.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Findings</p>
              <ul className="space-y-1">
                {cat.findings.map((f, i) => (
                  <li key={i} className="text-xs text-slate-600 flex gap-2">
                    <span className="text-slate-300 mt-0.5">•</span>{f}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {cat.recommendations.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-teal-600 uppercase tracking-wider mb-1.5">Recommendations</p>
              <ul className="space-y-1">
                {cat.recommendations.map((r, i) => (
                  <li key={i} className="text-xs text-slate-700 flex gap-2">
                    <span className="text-teal-400 mt-0.5 flex-shrink-0">→</span>{r}
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
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Sparkles size={20} className="text-teal-600" /> Listing Analysis
            </h1>
            <p className="text-sm text-slate-500 mt-0.5 truncate max-w-lg">{form.title}</p>
          </div>
          <button
            onClick={() => setAnalysis(null)}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-teal-600 border border-slate-200 hover:border-teal-300 px-3 py-2 rounded-lg transition-colors"
          >
            <RotateCcw size={14} /> Analyze Another
          </button>
        </div>

        {/* Score + Summary */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-6">
          <ScoreGauge score={analysis.overallScore} />
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-700 mb-1">Overall Score</p>
            <p className="text-sm text-slate-600 leading-relaxed">{analysis.overallSummary}</p>
          </div>
        </div>

        {/* Priority Fixes */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-800 mb-3">🎯 Top Priority Fixes</h2>
          <div className="space-y-3">
            {analysis.priorityFixes.map((fix, i) => (
              <div key={i} className="flex gap-3 p-3 bg-slate-50 rounded-lg">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 h-fit mt-0.5 ${IMPACT_COLORS[fix.impact]}`}>
                  {fix.impact.toUpperCase()}
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{fix.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{fix.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Category Cards */}
        <div>
          <h2 className="font-semibold text-slate-800 mb-3">Category Breakdown</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {analysis.categories.map(cat => (
              <CategoryCard key={cat.name} cat={cat} />
            ))}
          </div>
        </div>

        {/* Rewrites */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
          <h2 className="font-semibold text-slate-800">✏️ AI Rewrites</h2>

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Original Title</p>
            <p className="text-sm text-slate-500 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">{form.title}</p>
            <p className="text-xs font-semibold text-teal-600 uppercase tracking-wider mt-3 mb-2">Suggested Title</p>
            <p className="text-sm text-slate-800 font-medium bg-teal-50 px-3 py-2 rounded-lg border border-teal-100">{analysis.rewrittenTitle}</p>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Rewritten Opening</p>
            <p className="text-sm text-slate-800 bg-teal-50 px-3 py-2.5 rounded-lg border border-teal-100 leading-relaxed whitespace-pre-wrap">{analysis.rewrittenDescriptionOpening}</p>
          </div>
        </div>

        {/* Keywords */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-800 mb-3">🔍 SEO Keywords to Include</h2>
          <div className="flex flex-wrap gap-2">
            {analysis.suggestedKeywords.map(kw => (
              <span key={kw} className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 px-3 py-1 rounded-full font-medium">
                {kw}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <Sparkles size={20} className="text-teal-600" /> Listing Optimizer
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">Paste your Airbnb listing content and get AI-powered optimization recommendations.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Title + Type + Location */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Listing Basics</p>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Listing Title *</label>
            <input
              required
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="e.g. Cozy Mountain Cabin with Hot Tub & Stunning Views"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Property Type</label>
              <select
                value={form.propertyType}
                onChange={e => set('propertyType', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">Select...</option>
                {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Location / Neighborhood</label>
              <input
                value={form.location}
                onChange={e => set('location', e.target.value)}
                placeholder="e.g. Smoky Mountains, TN"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Nightly Price ($)</label>
              <input
                type="number"
                value={form.price}
                onChange={e => set('price', e.target.value)}
                placeholder="e.g. 195"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Number of Reviews</label>
              <input
                type="number"
                value={form.reviewCount}
                onChange={e => set('reviewCount', e.target.value)}
                placeholder="e.g. 47"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Star Rating</label>
              <input
                type="number"
                min="1"
                max="5"
                step="0.1"
                value={form.starRating}
                onChange={e => set('starRating', e.target.value)}
                placeholder="e.g. 4.85"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Description *</p>
          <textarea
            required
            value={form.description}
            onChange={e => set('description', e.target.value)}
            rows={8}
            placeholder="Paste your full Airbnb listing description here..."
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
          />
        </div>

        {/* Amenities */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Amenities</p>
          <textarea
            value={form.amenities}
            onChange={e => set('amenities', e.target.value)}
            rows={4}
            placeholder="Paste your amenities list, one per line or comma separated...&#10;e.g. WiFi, Pool, Hot tub, Full kitchen, Washer/dryer..."
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
          />
        </div>

        {/* Photos */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Photos</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Total Photo Count</label>
              <input
                type="number"
                value={form.photoCount}
                onChange={e => set('photoCount', e.target.value)}
                placeholder="e.g. 24"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">What's Covered</label>
              <input
                value={form.photoNotes}
                onChange={e => set('photoNotes', e.target.value)}
                placeholder="e.g. exterior, living room, kitchen, 2 bedrooms"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-500 text-center">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
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
