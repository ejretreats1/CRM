import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Wand2, Copy, Check, ChevronLeft, ChevronRight, Loader2,
  Instagram, Twitter, Linkedin, Facebook, Clock, Trash2,
  Download, RefreshCw, Hash, MessageSquare, Film, AlignLeft, LayoutGrid,
} from 'lucide-react';
import { supabase } from '../services/supabase';

type Platform = 'instagram' | 'twitter' | 'linkedin' | 'facebook' | 'tiktok';
type ContentType = 'carousel' | 'caption' | 'thread' | 'script';

interface Slide { slideNumber: number; headline: string; body: string; emoji?: string }
interface Tweet { tweetNumber: number; text: string }
interface Scene { scene: string; text: string; duration: string }
interface ContentResult {
  hook: string;
  slides?: Slide[];
  thread?: Tweet[];
  caption?: string;
  script?: Scene[];
  hashtags: string[];
  cta: string;
}
interface ContentPiece {
  id: string;
  topic: string;
  platform: Platform;
  content_type: ContentType;
  result: ContentResult;
  created_at: string;
}

const PLATFORMS: { id: Platform; label: string; icon: React.ElementType; color: string }[] = [
  { id: 'instagram', label: 'Instagram', icon: Instagram, color: '#e1306c' },
  { id: 'twitter',   label: 'X / Twitter', icon: Twitter, color: '#1da1f2' },
  { id: 'linkedin',  label: 'LinkedIn', icon: Linkedin, color: '#0a66c2' },
  { id: 'facebook',  label: 'Facebook', icon: Facebook, color: '#1877f2' },
  { id: 'tiktok',    label: 'TikTok', icon: Film, color: '#fe2c55' },
];

const CONTENT_TYPES: { id: ContentType; label: string; icon: React.ElementType; desc: string }[] = [
  { id: 'carousel', label: 'Carousel', icon: LayoutGrid, desc: '6-slide breakdown' },
  { id: 'caption',  label: 'Caption',  icon: AlignLeft,  desc: 'Single post copy' },
  { id: 'thread',   label: 'Thread',   icon: MessageSquare, desc: '6-tweet thread' },
  { id: 'script',   label: 'Script',   icon: Film,       desc: 'Reel/TikTok script' },
];

const SLIDE_GRADIENTS = [
  'from-[#0a1120] to-[#162035]',
  'from-[#0d1a2e] to-[#1a3050]',
  'from-[#0a1a10] to-[#0f2a1a]',
  'from-[#1a0a20] to-[#2a1040]',
  'from-[#1a1000] to-[#2a1a00]',
  'from-[#0a1120] to-[#1e2d45]',
];

function CopyBtn({ text, size = 'sm' }: { text: string; size?: 'sm' | 'xs' }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      onClick={copy}
      className={`flex items-center gap-1 transition-colors rounded-lg px-2 py-1 ${
        size === 'xs' ? 'text-xs' : 'text-xs'
      } ${copied ? 'text-[#4ab57a] bg-[#0a2518]' : 'text-[#3a5070] hover:text-[#b8d4f0] hover:bg-[#1e2d45]'}`}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function SlideCard({ slide, total, gradient }: { slide: Slide; total: number; gradient: string }) {
  return (
    <div className={`relative flex-shrink-0 w-72 h-72 rounded-2xl bg-gradient-to-br ${gradient} border border-[#1e3a5a] flex flex-col justify-between p-5 shadow-xl`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-[#4a90d9] tracking-widest uppercase">E&J Retreats</span>
        <span className="text-xs text-[#3a5070] font-medium">{slide.slideNumber}/{total}</span>
      </div>
      <div className="flex-1 flex flex-col justify-center gap-2 py-3">
        {slide.emoji && <div className="text-3xl">{slide.emoji}</div>}
        <h3 className="text-white font-bold text-lg leading-tight">{slide.headline}</h3>
        <p className="text-[#b8d4f0] text-sm leading-relaxed">{slide.body}</p>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-[#3a5070]">@ejretreats</span>
        <div className="flex gap-1">
          {Array.from({ length: total }, (_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all ${i === slide.slideNumber - 1 ? 'w-4 h-1.5 bg-[#4a90d9]' : 'w-1.5 h-1.5 bg-[#1e3a5a]'}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function CarouselPreview({ slides }: { slides: Slide[] }) {
  const [current, setCurrent] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  function scrollTo(idx: number) {
    setCurrent(idx);
    scrollRef.current?.children[idx]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  function copyAll() {
    const text = slides.map(s => `Slide ${s.slideNumber}:\n${s.emoji ? s.emoji + ' ' : ''}${s.headline}\n${s.body}`).join('\n\n---\n\n');
    navigator.clipboard.writeText(text);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-white">{slides.length} Slides</span>
        <div className="flex items-center gap-2">
          <button onClick={() => scrollTo(Math.max(0, current - 1))} disabled={current === 0} className="p-1.5 rounded-lg bg-[#1e2d45] text-[#b8d4f0] hover:bg-[#1e3a5a] disabled:opacity-30 transition-colors">
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs text-[#3a5070] w-12 text-center">{current + 1} / {slides.length}</span>
          <button onClick={() => scrollTo(Math.min(slides.length - 1, current + 1))} disabled={current === slides.length - 1} className="p-1.5 rounded-lg bg-[#1e2d45] text-[#b8d4f0] hover:bg-[#1e3a5a] disabled:opacity-30 transition-colors">
            <ChevronRight size={16} />
          </button>
          <button onClick={copyAll} className="flex items-center gap-1.5 text-xs text-[#4a90d9] border border-[#1e3a5a] px-3 py-1.5 rounded-lg hover:bg-[#1a2335] transition-colors">
            <Copy size={12} /> Copy All
          </button>
        </div>
      </div>

      {/* Horizontal scroll */}
      <div ref={scrollRef} className="flex gap-4 overflow-x-auto pb-3 snap-x snap-mandatory" style={{ scrollbarWidth: 'none' }}>
        {slides.map((slide, i) => (
          <div key={i} className="snap-center" onClick={() => setCurrent(i)}>
            <SlideCard slide={slide} total={slides.length} gradient={SLIDE_GRADIENTS[i % SLIDE_GRADIENTS.length]} />
          </div>
        ))}
      </div>

      {/* Individual slide copy */}
      <div className="space-y-2">
        {slides.map((slide, i) => (
          <div key={i} className="bg-[#0f1923] border border-[#1e2d45] rounded-xl p-3 flex items-start gap-3">
            <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-[#162035] border border-[#1e3a5a] flex items-center justify-center">
              <span className="text-xs font-bold text-[#4a90d9]">{slide.slideNumber}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white leading-tight">{slide.emoji} {slide.headline}</p>
              <p className="text-xs text-[#b8d4f0] mt-0.5 leading-relaxed">{slide.body}</p>
            </div>
            <CopyBtn text={`${slide.emoji ? slide.emoji + ' ' : ''}${slide.headline}\n${slide.body}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ThreadPreview({ tweets }: { tweets: Tweet[] }) {
  function copyAll() {
    navigator.clipboard.writeText(tweets.map(t => t.text).join('\n\n'));
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-white">{tweets.length} Tweets</span>
        <button onClick={copyAll} className="flex items-center gap-1.5 text-xs text-[#4a90d9] border border-[#1e3a5a] px-3 py-1.5 rounded-lg hover:bg-[#1a2335] transition-colors">
          <Copy size={12} /> Copy Thread
        </button>
      </div>
      {tweets.map((tweet, i) => (
        <div key={i} className="bg-[#0f1923] border border-[#1e2d45] rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#4a90d9] flex items-center justify-center">
              <span className="text-xs font-bold text-white">EJ</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm font-semibold text-white">E&J Retreats</span>
                <span className="text-xs text-[#3a5070]">@ejretreats</span>
                <span className="text-xs text-[#3a5070]">· {tweet.tweetNumber}/{tweets.length}</span>
              </div>
              <p className="text-sm text-[#b8d4f0] leading-relaxed">{tweet.text}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-[#3a5070]">{tweet.text.length} / 280</span>
                <CopyBtn text={tweet.text} />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CaptionPreview({ caption }: { caption: string }) {
  return (
    <div className="bg-[#0f1923] border border-[#1e2d45] rounded-xl p-4">
      <div className="flex items-start gap-3 mb-3">
        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-[#4a90d9] to-[#4ab57a] p-0.5">
          <div className="w-full h-full rounded-full bg-[#0a1120] flex items-center justify-center">
            <span className="text-xs font-bold text-white">EJ</span>
          </div>
        </div>
        <div>
          <span className="text-sm font-semibold text-white">ejretreats</span>
          <p className="text-xs text-[#3a5070]">Property Management</p>
        </div>
      </div>
      <div className="w-full aspect-square rounded-xl bg-gradient-to-br from-[#0a1120] to-[#1e2d45] border border-[#1e3a5a] flex items-center justify-center mb-3">
        <span className="text-4xl">🏠</span>
      </div>
      <p className="text-sm text-[#b8d4f0] leading-relaxed whitespace-pre-wrap">{caption}</p>
      <div className="flex justify-end mt-3">
        <CopyBtn text={caption} />
      </div>
    </div>
  );
}

function ScriptPreview({ scenes }: { scenes: Scene[] }) {
  function copyAll() {
    navigator.clipboard.writeText(
      scenes.map(s => `[${s.scene} - ${s.duration}]\n${s.text}`).join('\n\n')
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-white">{scenes.length} Scenes</span>
        <button onClick={copyAll} className="flex items-center gap-1.5 text-xs text-[#4a90d9] border border-[#1e3a5a] px-3 py-1.5 rounded-lg hover:bg-[#1a2335] transition-colors">
          <Copy size={12} /> Copy Script
        </button>
      </div>
      <div className="relative pl-4 border-l-2 border-[#1e3a5a] space-y-4">
        {scenes.map((scene, i) => (
          <div key={i} className="relative">
            <div className="absolute -left-5 w-2.5 h-2.5 rounded-full bg-[#4a90d9] border-2 border-[#0a1120]" />
            <div className="bg-[#0f1923] border border-[#1e2d45] rounded-xl p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#4a90d9] uppercase tracking-wide">{scene.scene}</span>
                  <span className="text-xs text-[#3a5070] bg-[#1e2d45] px-2 py-0.5 rounded-full">{scene.duration}</span>
                </div>
                <CopyBtn text={scene.text} />
              </div>
              <p className="text-sm text-[#b8d4f0] leading-relaxed">{scene.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ContentStudio() {
  const [topic, setTopic] = useState('');
  const [platform, setPlatform] = useState<Platform>('instagram');
  const [contentType, setContentType] = useState<ContentType>('carousel');
  const [context, setContext] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<ContentResult | null>(null);
  const [history, setHistory] = useState<ContentPiece[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [hashtagsCopied, setHashtagsCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    const { data } = await supabase
      .from('content_pieces')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    setHistory((data as ContentPiece[]) ?? []);
    setLoadingHistory(false);
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  async function generate() {
    if (!topic.trim()) return;
    setGenerating(true);
    setResult(null);
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow: 'content', action: 'generate', topic, platform, contentType, context }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Generation failed');
      setResult(data.result);
      loadHistory();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to generate content.');
    } finally {
      setGenerating(false);
    }
  }

  function copyHashtags() {
    if (!result) return;
    navigator.clipboard.writeText(result.hashtags.map(h => `#${h.replace(/^#/, '')}`).join(' ')).then(() => {
      setHashtagsCopied(true);
      setTimeout(() => setHashtagsCopied(false), 2000);
    });
  }

  function loadFromHistory(piece: ContentPiece) {
    setTopic(piece.topic);
    setPlatform(piece.platform);
    setContentType(piece.content_type);
    setResult(piece.result);
    setShowHistory(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function deleteHistory(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await supabase.from('content_pieces').delete().eq('id', id);
    setHistory(h => h.filter(p => p.id !== id));
  }

  const platformInfo = PLATFORMS.find(p => p.id === platform)!;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Wand2 size={20} className="text-[#4a90d9]" />
            Content Studio
          </h1>
          <p className="text-sm text-[#b8d4f0] mt-0.5">AI-powered social media content for E&J Retreats</p>
        </div>
        <button
          onClick={() => setShowHistory(v => !v)}
          className="flex items-center gap-1.5 text-xs text-[#3a5070] hover:text-[#b8d4f0] border border-[#1e2d45] px-3 py-2 rounded-lg transition-colors"
        >
          <Clock size={13} />
          History ({history.length})
        </button>
      </div>

      <div className="grid lg:grid-cols-[1fr_1.6fr] gap-6">
        {/* ── Input Panel ── */}
        <div className="space-y-4">
          <div className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl p-5 space-y-5">
            {/* Topic */}
            <div>
              <label className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide mb-2 block">Topic / Idea</label>
              <textarea
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="e.g. 5 reasons why now is the best time to list your property on Airbnb..."
                className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-xl p-3 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:ring-2 focus:ring-[#4a90d9] focus:border-transparent resize-none leading-relaxed"
                rows={3}
              />
            </div>

            {/* Platform */}
            <div>
              <label className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide mb-2 block">Platform</label>
              <div className="grid grid-cols-3 gap-2">
                {PLATFORMS.map(p => {
                  const Icon = p.icon;
                  const active = platform === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setPlatform(p.id)}
                      className={`flex flex-col items-center gap-1.5 py-2.5 px-2 rounded-xl border text-xs font-medium transition-all ${
                        active
                          ? 'border-[#1e3a5a] bg-[#162035] text-white'
                          : 'border-[#1e2d45] text-[#3a5070] hover:text-[#b8d4f0] hover:border-[#1e3a5a]'
                      }`}
                    >
                      <Icon size={18} style={{ color: active ? p.color : undefined }} />
                      <span className="leading-tight text-center">{p.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Content Type */}
            <div>
              <label className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide mb-2 block">Content Type</label>
              <div className="grid grid-cols-2 gap-2">
                {CONTENT_TYPES.map(ct => {
                  const Icon = ct.icon;
                  const active = contentType === ct.id;
                  return (
                    <button
                      key={ct.id}
                      onClick={() => setContentType(ct.id)}
                      className={`flex items-center gap-2.5 px-3 py-3 rounded-xl border text-left transition-all ${
                        active
                          ? 'border-[#1e3a5a] bg-[#162035] text-white'
                          : 'border-[#1e2d45] text-[#3a5070] hover:text-[#b8d4f0] hover:border-[#1e3a5a]'
                      }`}
                    >
                      <Icon size={16} className={active ? 'text-[#4a90d9]' : ''} />
                      <div>
                        <div className="text-xs font-semibold">{ct.label}</div>
                        <div className="text-[10px] text-[#3a5070]">{ct.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Optional context */}
            <div>
              <label className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide mb-2 block">
                Extra Context <span className="text-[#3a5070] font-normal normal-case">(optional)</span>
              </label>
              <textarea
                value={context}
                onChange={e => setContext(e.target.value)}
                placeholder="Property details, target audience, tone preferences, specific stats to include..."
                className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-xl p-3 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:ring-2 focus:ring-[#4a90d9] focus:border-transparent resize-none leading-relaxed"
                rows={2}
              />
            </div>

            {/* Generate button */}
            <button
              onClick={generate}
              disabled={generating || !topic.trim()}
              className="w-full flex items-center justify-center gap-2 bg-[#4a90d9] hover:bg-[#3a80c9] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors"
            >
              {generating ? (
                <><Loader2 size={17} className="animate-spin" /> Generating...</>
              ) : (
                <><Wand2 size={17} /> Generate Content</>
              )}
            </button>
          </div>

          {/* Platform tip */}
          <div className="bg-[#0f1923] border border-[#1e2d45] rounded-xl p-3 flex items-start gap-2.5">
            {(() => { const Icon = platformInfo.icon; return <Icon size={15} style={{ color: platformInfo.color }} className="flex-shrink-0 mt-0.5" />; })()}
            <p className="text-xs text-[#3a5070] leading-relaxed">
              {platform === 'instagram' && 'Instagram carousels get 3x more reach than single posts. Aim to save + share.'}
              {platform === 'twitter'   && 'Threads with a strong hook in tweet 1 drive up to 10x more impressions.'}
              {platform === 'linkedin'  && 'LinkedIn posts with data points get 2x more engagement. Keep it professional.'}
              {platform === 'facebook'  && 'Facebook loves storytelling. Personal angle and community questions drive comments.'}
              {platform === 'tiktok'    && 'TikTok hooks must land in the first 1-3 seconds. Energy is everything.'}
            </p>
          </div>
        </div>

        {/* ── Output Panel ── */}
        <div className="space-y-4">
          {generating && (
            <div className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl p-12 flex flex-col items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#162035] flex items-center justify-center">
                <Wand2 size={22} className="text-[#4a90d9] animate-pulse" />
              </div>
              <p className="text-sm text-[#b8d4f0] font-medium">Crafting your content...</p>
              <p className="text-xs text-[#3a5070]">This usually takes 10-20 seconds</p>
            </div>
          )}

          {!generating && !result && (
            <div className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl p-12 flex flex-col items-center justify-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-[#162035] border border-[#1e3a5a] flex items-center justify-center">
                <Wand2 size={26} className="text-[#3a5070]" />
              </div>
              <p className="text-sm text-[#3a5070] text-center">
                Enter a topic, pick your platform and content type, then hit Generate.
              </p>
            </div>
          )}

          {!generating && result && (
            <div className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl p-5 space-y-5">
              {/* Hook */}
              <div className="bg-[#0f1923] border border-[#1e3a5a] rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-[#4a90d9] uppercase tracking-wide">Hook</span>
                  <CopyBtn text={result.hook} />
                </div>
                <p className="text-sm font-semibold text-white leading-relaxed">{result.hook}</p>
              </div>

              {/* Content */}
              {contentType === 'carousel' && result.slides && result.slides.length > 0 && (
                <CarouselPreview slides={result.slides} />
              )}
              {contentType === 'thread' && result.thread && result.thread.length > 0 && (
                <ThreadPreview tweets={result.thread} />
              )}
              {contentType === 'caption' && result.caption && (
                <CaptionPreview caption={result.caption} />
              )}
              {contentType === 'script' && result.script && result.script.length > 0 && (
                <ScriptPreview scenes={result.script} />
              )}

              {/* CTA */}
              <div className="bg-[#0f1923] border border-[#1e2d45] rounded-xl p-3 flex items-center justify-between gap-3">
                <div>
                  <span className="text-xs text-[#3a5070] uppercase tracking-wide font-semibold">Call to Action</span>
                  <p className="text-sm text-[#b8d4f0] mt-0.5">{result.cta}</p>
                </div>
                <CopyBtn text={result.cta} />
              </div>

              {/* Hashtags */}
              {result.hashtags.length > 0 && (
                <div className="bg-[#0f1923] border border-[#1e2d45] rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-[#3a5070] uppercase tracking-wide font-semibold flex items-center gap-1">
                      <Hash size={11} /> Hashtags ({result.hashtags.length})
                    </span>
                    <button
                      onClick={copyHashtags}
                      className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors ${
                        hashtagsCopied ? 'text-[#4ab57a] bg-[#0a2518]' : 'text-[#3a5070] hover:text-[#b8d4f0] hover:bg-[#1e2d45]'
                      }`}
                    >
                      {hashtagsCopied ? <Check size={12} /> : <Copy size={12} />}
                      {hashtagsCopied ? 'Copied!' : 'Copy All'}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {result.hashtags.map((tag, i) => (
                      <span key={i} className="text-xs bg-[#162035] border border-[#1e3a5a] text-[#4a90d9] px-2 py-0.5 rounded-full font-medium">
                        #{tag.replace(/^#/, '')}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Regenerate */}
              <button
                onClick={generate}
                disabled={generating}
                className="w-full flex items-center justify-center gap-2 border border-[#1e3a5a] text-[#4a90d9] hover:bg-[#1a2335] text-sm font-medium py-2.5 rounded-xl transition-colors"
              >
                <RefreshCw size={14} /> Regenerate
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── History ── */}
      {showHistory && (
        <div className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-white">Recent Content</h2>
            <button onClick={() => setShowHistory(false)} className="text-xs text-[#3a5070] hover:text-[#b8d4f0]">Close</button>
          </div>
          {loadingHistory ? (
            <div className="flex items-center justify-center py-8"><Loader2 size={20} className="animate-spin text-[#3a5070]" /></div>
          ) : history.length === 0 ? (
            <p className="text-sm text-[#3a5070] text-center py-8">No content generated yet.</p>
          ) : (
            <div className="space-y-2">
              {history.map(piece => {
                const PIcon = PLATFORMS.find(p => p.id === piece.platform)?.icon ?? Wand2;
                const pColor = PLATFORMS.find(p => p.id === piece.platform)?.color ?? '#4a90d9';
                const TypeIcon = CONTENT_TYPES.find(t => t.id === piece.content_type)?.icon ?? LayoutGrid;
                return (
                  <div
                    key={piece.id}
                    onClick={() => loadFromHistory(piece)}
                    className="flex items-center gap-3 bg-[#0f1923] border border-[#1e2d45] rounded-xl p-3 cursor-pointer hover:border-[#1e3a5a] transition-colors group"
                  >
                    <PIcon size={16} style={{ color: pColor }} className="flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{piece.topic}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-[#3a5070] capitalize">{piece.platform}</span>
                        <span className="text-[#1e3a5a]">·</span>
                        <TypeIcon size={11} className="text-[#3a5070]" />
                        <span className="text-xs text-[#3a5070] capitalize">{piece.content_type}</span>
                        <span className="text-[#1e3a5a]">·</span>
                        <span className="text-xs text-[#3a5070]">{new Date(piece.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <button
                      onClick={e => deleteHistory(piece.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-[#3a5070] hover:text-[#e05c5c] hover:bg-[#2a0e0e] transition-all"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
