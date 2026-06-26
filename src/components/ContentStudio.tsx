import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Wand2, Copy, Check, ChevronLeft, ChevronRight, Loader2,
  Instagram, Twitter, Linkedin, Facebook, Clock, Trash2,
  RefreshCw, Hash, MessageSquare, Film, AlignLeft, LayoutGrid, Send,
} from 'lucide-react';
import { supabase } from '../services/supabase';
import { cacheGet } from '../services/appCache';
import { postToFacebook, postCarousel } from '../services/meta';
import type { MetaConnection, MetaPage } from '../services/meta';

type Platform = 'instagram' | 'twitter' | 'linkedin' | 'facebook' | 'tiktok';
type ContentType = 'carousel' | 'caption' | 'thread' | 'script' | 'tweet-card';

interface Slide { slideNumber: number; headline: string; body: string; emoji?: string }
interface Tweet { tweetNumber: number; text: string }
interface Scene { scene: string; text: string; duration: string }
interface TweetCardItem { text: string; angle: string }
interface ContentResult {
  hook: string;
  slides?: Slide[];
  thread?: Tweet[];
  caption?: string;
  script?: Scene[];
  tweetCards?: TweetCardItem[];
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
  { id: 'instagram', label: 'Instagram',  icon: Instagram, color: '#e1306c' },
  { id: 'twitter',   label: 'X / Twitter', icon: Twitter,   color: '#000000' },
  { id: 'linkedin',  label: 'LinkedIn',   icon: Linkedin,  color: '#0a66c2' },
  { id: 'facebook',  label: 'Facebook',   icon: Facebook,  color: '#1877f2' },
  { id: 'tiktok',    label: 'TikTok',     icon: Film,      color: '#fe2c55' },
];

const CONTENT_TYPES: { id: ContentType; label: string; icon: React.ElementType; desc: string }[] = [
  { id: 'tweet-card', label: 'Tweet Card', icon: Twitter,       desc: 'Screenshot-style cards for IG' },
  { id: 'carousel',   label: 'Carousel',   icon: LayoutGrid,    desc: '6-slide breakdown' },
  { id: 'caption',    label: 'Caption',    icon: AlignLeft,     desc: 'Single post copy' },
  { id: 'thread',     label: 'Thread',     icon: MessageSquare, desc: '6-tweet thread' },
  { id: 'script',     label: 'Script',     icon: Film,          desc: 'Reel/TikTok script' },
];

const SLIDE_GRADIENTS = [
  'from-[#0a1120] to-[#162035]',
  'from-[#0d1a2e] to-[#1a3050]',
  'from-[#0a1a10] to-[#0f2a1a]',
  'from-[#1a0a20] to-[#2a1040]',
  'from-[#1a1000] to-[#2a1a00]',
  'from-[#0a1120] to-[#1e2d45]',
];

function CopyBtn({ text }: { text: string }) {
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
      className={`flex items-center gap-1 text-xs transition-colors rounded-lg px-2 py-1 ${
        copied ? 'text-[#4ab57a] bg-[#0a2518]' : 'text-[#3a5070] hover:text-[#b8d4f0] hover:bg-[#1e2d45]'
      }`}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

// ── Meta Publish Panel ────────────────────────────────────────────────────────

type PostStatus = 'idle' | 'posting' | 'done' | 'error';

type PublishStatus = 'idle' | 'capturing' | 'uploading' | 'posting' | 'done' | 'error';

function MetaPublish({ contentType, caption, hashtags, cardCount }: {
  contentType: string;
  caption: string;
  hashtags: string[];
  cardCount?: number;
}) {
  const [conn, setConn] = useState<MetaConnection | null>(null);
  const [selectedPage, setSelectedPage] = useState<MetaPage | null>(null);
  const [igOverride, setIgOverride] = useState<{ id: string; username: string } | null>(null);
  const [status, setStatus] = useState<PublishStatus>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [fbStatus, setFbStatus] = useState<PostStatus>('idle');
  const [fbError, setFbError] = useState('');

  useEffect(() => {
    cacheGet<{ pages: MetaPage[]; connectedAt: string; expiresAt: string }>('meta_connection').then(v => {
      if (!v) return;
      const safe: MetaConnection = { pages: v.pages.map(p => ({ id: p.id, name: p.name, igAccount: p.igAccount })), connectedAt: v.connectedAt, expiresAt: v.expiresAt };
      setConn(safe);
      if (safe.pages.length > 0) setSelectedPage(safe.pages[0]);
    });
    cacheGet<{ id: string; username: string }>('meta_ig_override').then(v => { if (v) setIgOverride(v); });
  }, []);

  if (!conn) return (
    <div className="bg-[#0f1923] border border-[#1e2d45] rounded-xl p-3 text-xs text-[#3a5070]">
      <Facebook size={13} className="inline mr-1.5 text-[#1877F2]" />
      Connect Meta in Settings to publish directly to Facebook and Instagram.
    </div>
  );

  if (conn.pages.length === 0) return (
    <div className="bg-[#1a1000] border border-[#3a2a00] rounded-xl p-3 space-y-1">
      <p className="text-xs font-semibold text-[#d0954a]">No Facebook Pages found</p>
      <p className="text-xs text-[#8a6030]">Go to Settings → Meta → Disconnect, then reconnect and make sure to grant access to your E&J Retreats page when the popup appears.</p>
    </div>
  );

  const fullCaption = caption + (hashtags.length ? '\n\n' + hashtags.map(h => `#${h.replace(/^#/, '')}`).join(' ') : '');
  const igAccount   = selectedPage?.igAccount ?? igOverride ?? null;
  const isTweetCard = contentType === 'tweet-card';
  const count       = cardCount ?? 0;

  async function captureAllCards(): Promise<string[]> {
    const { toPng } = await import('html-to-image');
    const urls: string[] = [];
    for (let i = 0; i < count; i++) {
      const el = document.getElementById(`tweet-card-${i}`);
      if (!el) continue;
      setStatusMsg(`Capturing card ${i + 1} of ${count}…`);
      const dataUrl = await toPng(el, { pixelRatio: 2 });
      setStatusMsg(`Uploading card ${i + 1} of ${count}…`);
      const blob = await (await fetch(dataUrl)).blob();
      const filename = `ig-${Date.now()}-${i}.png`;
      const { data, error } = await supabase.storage
        .from('content-images')
        .upload(filename, blob, { contentType: 'image/png', upsert: true });
      if (error) throw new Error(`Upload failed: ${error.message}`);
      urls.push(supabase.storage.from('content-images').getPublicUrl(data.path).data.publicUrl);
    }
    return urls;
  }

  async function handlePostAll() {
    if (!selectedPage) return;
    setStatus('capturing'); setStatusMsg('Capturing cards…');
    try {
      const imageUrls = await captureAllCards();
      setStatus('posting'); setStatusMsg('Posting to Facebook & Instagram…');
      await postCarousel(selectedPage.id, igAccount?.id ?? null, imageUrls, fullCaption);
      setStatus('done'); setStatusMsg('');
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : 'Failed');
      setStatus('error');
    }
  }

  async function handlePostFacebook() {
    if (!selectedPage) return;
    setFbStatus('posting'); setFbError('');
    try {
      await postToFacebook(selectedPage.id, fullCaption);
      setFbStatus('done');
    } catch (e) {
      setFbError(e instanceof Error ? e.message : 'Failed');
      setFbStatus('error');
    }
  }

  const busy = status === 'capturing' || status === 'uploading' || status === 'posting';

  return (
    <div className="bg-[#0f1923] border border-[#1e3a5a] rounded-xl p-4 space-y-3">
      <p className="text-xs font-bold text-[#4a90d9] uppercase tracking-wide flex items-center gap-1.5">
        <Send size={11} /> Publish
      </p>

      {/* Page selector */}
      {conn.pages.length > 1 && (
        <select
          value={selectedPage?.id ?? ''}
          onChange={e => setSelectedPage(conn.pages.find(p => p.id === e.target.value) ?? null)}
          className="w-full bg-[#1a2335] border border-[#1e2d45] text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#1877F2]"
        >
          {conn.pages.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      )}

      {/* Tweet cards: one button posts all as carousel to both platforms */}
      {isTweetCard && (
        <div className="space-y-2">
          <button
            onClick={handlePostAll}
            disabled={busy || status === 'done' || !selectedPage}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#1877F2] via-purple-600 to-pink-500 hover:opacity-90 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2.5 rounded-lg transition-all"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : status === 'done' ? <Check size={13} /> : <Send size={13} />}
            {busy
              ? statusMsg
              : status === 'done'
              ? 'Posted to Facebook & Instagram!'
              : `Post all ${count > 0 ? count : ''} cards as carousel`}
          </button>
          {status === 'error' && <p className="text-xs text-[#e05c5c]">{statusMsg}</p>}
          {!igAccount && (
            <p className="text-xs text-[#3a5070]">
              <Instagram size={10} className="inline mr-1" />
              Add Instagram in Settings → Meta to include IG in the post.
            </p>
          )}
        </div>
      )}

      {/* Caption type: Facebook text post only */}
      {!isTweetCard && (
        <div className="flex items-center gap-2">
          <button
            onClick={handlePostFacebook}
            disabled={!selectedPage || fbStatus === 'posting' || fbStatus === 'done'}
            className="flex items-center gap-1.5 bg-[#1877F2] hover:bg-[#1464d8] disabled:opacity-60 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            <Facebook size={12} />
            {fbStatus === 'posting' ? 'Posting…' : fbStatus === 'done' ? 'Posted!' : 'Post to Facebook'}
          </button>
          {fbStatus === 'error' && <p className="text-xs text-[#e05c5c] flex-1">{fbError}</p>}
        </div>
      )}
    </div>
  );
}

// ── Tweet Card (looks like a Twitter/X screenshot to post on IG) ─────────────

function TweetCard({ card, index }: { card: TweetCardItem; index: number }) {
  const angles = ['Bold Statement', 'Story / Data', 'List Format'];
  const label = card.angle || angles[index] || `Variation ${index + 1}`;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-[#3a5070] font-medium">{label}</span>
        <CopyBtn text={card.text} />
      </div>

      {/* The card itself — styled to look like a real Twitter/X screenshot */}
      <div
        id={`tweet-card-${index}`}
        className="rounded-2xl overflow-hidden shadow-2xl border border-gray-200"
        style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', background: '#ffffff' }}
      >
        <div className="p-5">
          {/* Header row */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              {/* Avatar */}
              <img
                src="/tropical-logo.png"
                alt="E&J Retreats"
                style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid #e1e8ed' }}
              />
              <div>
                <div className="flex items-center gap-1">
                  <span style={{ fontWeight: 700, fontSize: 15, color: '#0f1419' }}>E&J Retreats</span>
                  {/* Blue verified checkmark */}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="12" fill="#1d9bf0" />
                    <path d="M9.5 16.5L5.5 12.5L6.91 11.09L9.5 13.67L17.09 6.08L18.5 7.5L9.5 16.5Z" fill="white" />
                  </svg>
                </div>
                <span style={{ fontSize: 14, color: '#536471' }}>@ejretreats</span>
              </div>
            </div>
            {/* X logo */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" fill="#000" />
            </svg>
          </div>

          {/* Tweet text */}
          <p style={{ fontSize: 20, lineHeight: 1.5, color: '#0f1419', whiteSpace: 'pre-wrap' }}>
            {card.text}
          </p>
        </div>
      </div>
    </div>
  );
}

function TweetCardPreview({ cards }: { cards: TweetCardItem[] }) {
  return (
    <div className="space-y-5">
      <div className="bg-[#162035] border border-[#1e3a5a] rounded-xl px-4 py-3">
        <p className="text-xs text-[#4a90d9] font-semibold flex items-center gap-2">
          <Twitter size={13} />
          Screenshot any card below and post it as a photo on Instagram, Facebook, or LinkedIn
        </p>
      </div>
      {cards.map((card, i) => (
        <TweetCard key={i} card={card} index={i} />
      ))}
    </div>
  );
}

// ── Carousel ─────────────────────────────────────────────────────────────────

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
            <div key={i} className={`rounded-full transition-all ${i === slide.slideNumber - 1 ? 'w-4 h-1.5 bg-[#4a90d9]' : 'w-1.5 h-1.5 bg-[#1e3a5a]'}`} />
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
      <div ref={scrollRef} className="flex gap-4 overflow-x-auto pb-3 snap-x snap-mandatory" style={{ scrollbarWidth: 'none' }}>
        {slides.map((slide, i) => (
          <div key={i} className="snap-center" onClick={() => setCurrent(i)}>
            <SlideCard slide={slide} total={slides.length} gradient={SLIDE_GRADIENTS[i % SLIDE_GRADIENTS.length]} />
          </div>
        ))}
      </div>
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

// ── Thread ────────────────────────────────────────────────────────────────────

function ThreadPreview({ tweets }: { tweets: Tweet[] }) {
  function copyAll() { navigator.clipboard.writeText(tweets.map(t => t.text).join('\n\n')); }
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
                <span className="text-xs text-[#3a5070]">@ejretreats · {tweet.tweetNumber}/{tweets.length}</span>
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

// ── Caption ───────────────────────────────────────────────────────────────────

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
      <div className="flex justify-end mt-3"><CopyBtn text={caption} /></div>
    </div>
  );
}

// ── Script ────────────────────────────────────────────────────────────────────

function ScriptPreview({ scenes }: { scenes: Scene[] }) {
  function copyAll() {
    navigator.clipboard.writeText(scenes.map(s => `[${s.scene} - ${s.duration}]\n${s.text}`).join('\n\n'));
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

// ── Main Component ────────────────────────────────────────────────────────────

export default function ContentStudio() {
  const [topic, setTopic] = useState('');
  const [platform, setPlatform] = useState<Platform>('instagram');
  const [contentType, setContentType] = useState<ContentType>('tweet-card');
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
                placeholder="e.g. 5 reasons to use platform promotions on Airbnb without losing revenue..."
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
                        active ? 'border-[#1e3a5a] bg-[#162035] text-white' : 'border-[#1e2d45] text-[#3a5070] hover:text-[#b8d4f0] hover:border-[#1e3a5a]'
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
                        active ? 'border-[#1e3a5a] bg-[#162035] text-white' : 'border-[#1e2d45] text-[#3a5070] hover:text-[#b8d4f0] hover:border-[#1e3a5a]'
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
                placeholder="Specific stats, tone, target audience, property details..."
                className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-xl p-3 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:ring-2 focus:ring-[#4a90d9] focus:border-transparent resize-none leading-relaxed"
                rows={2}
              />
            </div>

            <button
              onClick={generate}
              disabled={generating || !topic.trim()}
              className="w-full flex items-center justify-center gap-2 bg-[#4a90d9] hover:bg-[#3a80c9] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors"
            >
              {generating ? <><Loader2 size={17} className="animate-spin" /> Generating...</> : <><Wand2 size={17} /> Generate Content</>}
            </button>
          </div>

          {/* Platform tip */}
          <div className="bg-[#0f1923] border border-[#1e2d45] rounded-xl p-3 flex items-start gap-2.5">
            {(() => { const Icon = platformInfo.icon; return <Icon size={15} style={{ color: platformInfo.color }} className="flex-shrink-0 mt-0.5" />; })()}
            <p className="text-xs text-[#3a5070] leading-relaxed">
              {platform === 'instagram' && 'Tweet Card posts perform extremely well on Instagram — they feel native, get saved, and drive follows.'}
              {platform === 'twitter'   && 'Threads with a strong hook in tweet 1 drive up to 10x more impressions.'}
              {platform === 'linkedin'  && 'LinkedIn posts with data points get 2x more engagement. Keep it professional.'}
              {platform === 'facebook'  && 'Facebook loves storytelling. Personal angle and community questions drive comments.'}
              {platform === 'tiktok'    && 'TikTok hooks must land in the first 1-3 seconds. Energy is everything.'}
            </p>
          </div>

          {contentType === 'tweet-card' && (
            <div className="bg-[#0f1923] border border-[#1e3a5a] rounded-xl p-3">
              <p className="text-xs text-[#4a90d9] font-semibold mb-1">How Tweet Cards work</p>
              <p className="text-xs text-[#3a5070] leading-relaxed">
                Claude generates 3 punchy tweet-style posts. Each one renders here as a realistic Twitter/X card. Take a screenshot and post it as a photo on any platform.
              </p>
            </div>
          )}
        </div>

        {/* ── Output Panel ── */}
        <div className="space-y-4">
          {generating && (
            <div className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl p-12 flex flex-col items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#162035] flex items-center justify-center">
                <Wand2 size={22} className="text-[#4a90d9] animate-pulse" />
              </div>
              <p className="text-sm text-[#b8d4f0] font-medium">Crafting your content...</p>
              <p className="text-xs text-[#3a5070]">Usually takes 10–20 seconds</p>
            </div>
          )}

          {!generating && !result && (
            <div className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl p-12 flex flex-col items-center justify-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-[#162035] border border-[#1e3a5a] flex items-center justify-center">
                <Wand2 size={26} className="text-[#3a5070]" />
              </div>
              <p className="text-sm text-[#3a5070] text-center">Enter a topic, pick your format, then hit Generate.</p>
            </div>
          )}

          {!generating && result && (
            <div className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl p-5 space-y-5">
              {/* Tweet Cards — no hook/hashtag clutter, just the cards */}
              {contentType === 'tweet-card' && result.tweetCards && result.tweetCards.length > 0 ? (
                <>
                  <TweetCardPreview cards={result.tweetCards} />
                  {result.hashtags.length > 0 && (
                    <div className="bg-[#0f1923] border border-[#1e2d45] rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-[#3a5070] uppercase tracking-wide font-semibold flex items-center gap-1">
                          <Hash size={11} /> Hashtags for caption ({result.hashtags.length})
                        </span>
                        <button
                          onClick={copyHashtags}
                          className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors ${hashtagsCopied ? 'text-[#4ab57a] bg-[#0a2518]' : 'text-[#3a5070] hover:text-[#b8d4f0] hover:bg-[#1e2d45]'}`}
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
                </>
              ) : (
                <>
                  {/* Hook */}
                  <div className="bg-[#0f1923] border border-[#1e3a5a] rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-[#4a90d9] uppercase tracking-wide">Hook</span>
                      <CopyBtn text={result.hook} />
                    </div>
                    <p className="text-sm font-semibold text-white leading-relaxed">{result.hook}</p>
                  </div>

                  {contentType === 'carousel' && result.slides && result.slides.length > 0 && <CarouselPreview slides={result.slides} />}
                  {contentType === 'thread'   && result.thread  && result.thread.length  > 0 && <ThreadPreview  tweets={result.thread}   />}
                  {contentType === 'caption'  && result.caption                               && <CaptionPreview caption={result.caption}  />}
                  {contentType === 'script'   && result.script  && result.script.length  > 0 && <ScriptPreview  scenes={result.script}    />}

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
                          className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors ${hashtagsCopied ? 'text-[#4ab57a] bg-[#0a2518]' : 'text-[#3a5070] hover:text-[#b8d4f0] hover:bg-[#1e2d45]'}`}
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
                </>
              )}

              {/* Publish to Meta */}
              {(contentType === 'caption' || contentType === 'tweet-card') && (
                <MetaPublish
                  contentType={contentType}
                  caption={contentType === 'caption' ? (result.caption ?? result.hook) : result.hook}
                  hashtags={result.hashtags}
                  cardCount={result.tweetCards?.length}
                />
              )}

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
