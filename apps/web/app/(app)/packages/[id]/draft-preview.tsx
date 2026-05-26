'use client';

import { useState } from 'react';
import {
  MessageCircle,
  Repeat2,
  Heart,
  Send,
  ThumbsUp,
  MessageSquare,
  Bookmark,
  MoreHorizontal,
  ImageIcon,
  ChevronLeft,
  ChevronRight,
  FileText,
  Film,
  Volume2,
  SlidersHorizontal,
} from 'lucide-react';
import type { DraftFormat, VisualResponse } from '@contentpulse/types';
import { useMe } from '@/lib/hooks/use-auth';

function readyVisualUrl(v?: VisualResponse): string | null {
  if (!v?.cdn_url) return null;
  if (v.status !== 'ready' && v.status !== 'approved') return null;
  return v.cdn_url;
}

// ── Raw-text fallback ─────────────────────────────────────────────────────────
// Shown when the model returned reasoning text instead of structured JSON.

function RawTextFallback({ format, rawText }: { format: DraftFormat; rawText: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/30 overflow-hidden">
      <div className="px-4 pt-3 pb-2 flex items-center gap-2 border-b border-amber-200 dark:border-amber-800">
        <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Preview unavailable</span>
        <span className="text-xs text-muted-foreground ml-auto capitalize">{format.replace(/_/g, ' ')}</span>
      </div>
      <div className="p-4 space-y-2">
        <p className="text-xs text-muted-foreground">
          The model returned reasoning text instead of the expected JSON. Regenerate this draft to get a structured preview.
        </p>
        <div className="text-xs">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`} />
            Show raw output
          </button>
          {open && (
            <pre className="mt-1.5 bg-muted/60 border border-border rounded p-2.5 overflow-auto max-h-48 whitespace-pre-wrap leading-relaxed text-[11px]">
              {rawText}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

// ── JSON recovery ─────────────────────────────────────────────────────────────
// When the model output is stored as raw_text (parse failed, usually truncation),
// try to recover a usable object before giving up and showing the error card.

function tryRecoverContent(rawText: string): Record<string, unknown> | null {
  const trimmed = rawText.trim();
  const start = trimmed.indexOf('{');
  if (start === -1) return null;

  const frag = trimmed.slice(start);

  // 1. Standard parse — handles a preamble before the JSON (e.g. "Here is the JSON:\n{...}")
  try { return JSON.parse(frag) as Record<string, unknown>; } catch { /* try next strategy */ }

  // 2. Truncation recovery — the JSON was cut off before the closing }.
  //    Walk back to the last `",` which is a field-terminator sequence, then close the object.
  //    In valid JSON, a field-closing `"` is always immediately followed by `,` (or `}`).
  //    Field values themselves don't contain literal `",` (quotes inside strings are escaped as `\"`).
  const lastFieldEnd = frag.lastIndexOf('",');
  if (lastFieldEnd > 1) {
    try {
      return JSON.parse(frag.slice(0, lastFieldEnd + 1) + '\n}') as Record<string, unknown>;
    } catch { /* try next strategy */ }
  }

  // 3. Regex fallback — extract whatever complete key:value pairs exist
  const result: Record<string, unknown> = {};

  const strRe = /"([\w_]+)":\s*"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = strRe.exec(frag)) !== null) {
    if (m[1]) {
      result[m[1]] = (m[2] ?? '')
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    }
  }

  const numRe = /"([\w_]+)":\s*(-?\d+(?:\.\d+)?)/g;
  while ((m = numRe.exec(frag)) !== null) {
    if (m[1] && m[2] && !(m[1] in result)) result[m[1]] = parseFloat(m[2]);
  }

  const arrRe = /"([\w_]+)":\s*\[([^\]]*)\]/g;
  while ((m = arrRe.exec(frag)) !== null) {
    if (m[1]) result[m[1]] = (m[2] ?? '').match(/"([^"]*)"/g)?.map((s) => s.slice(1, -1)) ?? [];
  }

  return Object.keys(result).length > 0 ? result : null;
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function Avatar({ initial, gradient }: { initial: string; gradient: string }) {
  return (
    <div className={`h-9 w-9 rounded-full ${gradient} flex-shrink-0 flex items-center justify-center`}>
      <span className="text-white text-[11px] font-bold uppercase">{initial}</span>
    </div>
  );
}

function LinkedInHeader({ label, right }: { label: string; right?: string | undefined }) {
  return (
    <div className="px-4 pt-3 pb-2 flex items-center gap-2 border-b border-border/60">
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-[#0A66C2]">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
      <span className="text-xs text-muted-foreground">{label}</span>
      {right && <span className="text-xs text-muted-foreground ml-auto">{right}</span>}
    </div>
  );
}

function LinkedInAuthorRow({ name, handle }: { name: string; handle: string }) {
  const initial = name.charAt(0) || 'Y';
  return (
    <div className="flex items-center gap-2.5">
      <Avatar initial={initial} gradient="bg-gradient-to-br from-blue-500 to-indigo-600" />
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-none">{name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">@{handle} · Just now</p>
      </div>
    </div>
  );
}

function LinkedInEngagementBar() {
  return (
    <div className="flex items-center gap-4 pt-2 border-t border-border text-muted-foreground text-xs">
      <span className="flex items-center gap-1"><ThumbsUp className="h-3.5 w-3.5" /> Like</span>
      <span className="flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" /> Comment</span>
      <span className="flex items-center gap-1"><Repeat2 className="h-3.5 w-3.5" /> Repost</span>
      <span className="flex items-center gap-1 ml-auto"><Send className="h-3.5 w-3.5" /> Send</span>
    </div>
  );
}

// ── X Thread ──────────────────────────────────────────────────────────────────

type XThreadBody = {
  hook_tweet?: string;
  tweets?: Array<{ number: number; text: string }>;
  cta_tweet?: string;
  hashtags?: string[];
};

function XThreadPreview({ body, name, handle }: { body: XThreadBody; name: string; handle: string }) {
  const initial = name.charAt(0) || 'Y';
  const allTweets = [
    body.hook_tweet,
    ...(body.tweets ?? []).sort((a, b) => a.number - b.number).map((t) => t.text),
    body.cta_tweet,
  ].filter((t): t is string => typeof t === 'string' && t.trim().length > 0);

  const hashtags = (body.hashtags ?? []).map((h) => (h.startsWith('#') ? h : `#${h}`));

  return (
    <div className="rounded-xl border border-border bg-background overflow-hidden">
      <div className="px-4 pt-3 pb-2 flex items-center gap-2 border-b border-border/60">
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current shrink-0">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.857L1.546 2.25h6.937l4.254 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
        </svg>
        <span className="text-xs text-muted-foreground">
          Thread preview{allTweets.length > 0 ? ` · ${allTweets.length} tweets` : ''}
        </span>
      </div>

      <div className="px-4 py-3">
        {allTweets.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No tweets yet.</p>
        ) : (
          allTweets.map((tweet, i) => (
            <div key={i} className="flex gap-3">
              <div className="flex flex-col items-center">
                <Avatar initial={initial} gradient="bg-gradient-to-br from-sky-400 to-blue-600" />
                {i < allTweets.length - 1 && (
                  <div className="w-px bg-border flex-1 mt-1 mb-1 min-h-[16px]" />
                )}
              </div>
              <div className="flex-1 min-w-0 pb-3">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-sm font-bold leading-none">{name}</span>
                  <span className="text-xs text-muted-foreground leading-none">@{handle} · now</span>
                </div>
                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{tweet}</p>
                <div className="flex items-center gap-5 mt-2 text-muted-foreground">
                  <MessageCircle className="h-3.5 w-3.5" />
                  <Repeat2 className="h-3.5 w-3.5" />
                  <Heart className="h-3.5 w-3.5" />
                  <Send className="h-3.5 w-3.5" />
                </div>
              </div>
            </div>
          ))
        )}
        {hashtags.length > 0 && (
          <p className="text-xs text-sky-500 pt-1 flex flex-wrap gap-x-2 gap-y-0.5">
            {hashtags.map((h, i) => <span key={i}>{h}</span>)}
          </p>
        )}
      </div>
    </div>
  );
}

// ── LinkedIn Article ──────────────────────────────────────────────────────────

type LinkedInArticleBody = {
  title?: string;
  hook?: string;
  body?: string;
  cta?: string;
  estimated_read_time_minutes?: number;
};

function LinkedInArticlePreview({ body, name, handle, visual, onOpenDetails }: { body: LinkedInArticleBody; name: string; handle: string; visual?: VisualResponse; onOpenDetails?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const bodyText = body.body ?? '';
  const shouldTruncate = bodyText.length > 400;
  const readTime = body.estimated_read_time_minutes;
  const imageUrl = readyVisualUrl(visual);

  return (
    <div className="rounded-xl border border-border bg-background overflow-hidden">
      <LinkedInHeader
        label="LinkedIn Article preview"
        right={readTime != null ? `${readTime} min read` : undefined}
      />
      {imageUrl && (
        <div className="relative">
          <img src={imageUrl} alt="" className="w-full aspect-[16/9] object-cover" />
          {onOpenDetails && (
            <button
              onClick={onOpenDetails}
              className="absolute top-2 left-2 h-7 w-7 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center transition-colors"
              title="Image details"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-white" />
            </button>
          )}
        </div>
      )}
      <div className="p-4 space-y-3">
        <LinkedInAuthorRow name={name} handle={handle} />
        {body.title && <h3 className="font-bold text-base leading-snug">{body.title}</h3>}
        {body.hook && <p className="text-sm leading-relaxed font-medium">{body.hook}</p>}
        {bodyText && (
          <div>
            <div className={`overflow-hidden transition-all ${!expanded && shouldTruncate ? 'max-h-32' : 'max-h-72 overflow-y-auto'}`}>
              <p className="text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap">
                {bodyText}
              </p>
            </div>
            {shouldTruncate && (
              <button
                className="text-xs text-muted-foreground hover:text-foreground mt-1 transition-colors"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? 'Show less' : '…see more'}
              </button>
            )}
          </div>
        )}
        {body.cta && (
          <div className="border-l-[3px] border-[#0A66C2] pl-3 py-0.5">
            <p className="text-sm text-muted-foreground leading-relaxed">{body.cta}</p>
          </div>
        )}
        <LinkedInEngagementBar />
      </div>
    </div>
  );
}

// ── LinkedIn Carousel ─────────────────────────────────────────────────────────

type LinkedInCarouselBody = {
  slides?: Array<{ slide_number: number; headline: string; body: string }>;
  cover_slide?: string;
  cta_slide?: string;
};

type CarouselSlide =
  | { kind: 'cover'; text: string }
  | { kind: 'content'; slide_number: number; headline: string; body: string }
  | { kind: 'cta'; text: string };

function LinkedInCarouselPreview({ body, name, handle }: { body: LinkedInCarouselBody; name: string; handle: string }) {
  const [idx, setIdx] = useState(0);

  const slides: CarouselSlide[] = [
    ...(body.cover_slide ? [{ kind: 'cover' as const, text: body.cover_slide }] : []),
    ...(body.slides ?? [])
      .sort((a, b) => a.slide_number - b.slide_number)
      .map((s) => ({ kind: 'content' as const, ...s })),
    ...(body.cta_slide ? [{ kind: 'cta' as const, text: body.cta_slide }] : []),
  ];

  const total = slides.length;
  const current = slides[Math.min(idx, total - 1)];

  return (
    <div className="rounded-xl border border-border bg-background overflow-hidden">
      <LinkedInHeader label={`LinkedIn Carousel preview${total > 0 ? ` · ${total} slides` : ''}`} />
      <div className="p-4 space-y-3">
        <LinkedInAuthorRow name={name} handle={handle} />

        {/* Slide viewport */}
        <div className="relative">
          <div className="aspect-square rounded-lg overflow-hidden border border-border relative">
            {!current ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">No slides yet.</div>
            ) : current.kind === 'cover' ? (
              <div className="h-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center p-6 relative">
                <span className="absolute top-2 left-2 text-[10px] bg-white/20 text-white px-2 py-0.5 rounded-full">Cover</span>
                <p className="text-white font-bold text-center text-base leading-snug">{current.text}</p>
              </div>
            ) : current.kind === 'cta' ? (
              <div className="h-full bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center p-6 relative">
                <span className="absolute top-2 left-2 text-[10px] bg-white/20 text-white px-2 py-0.5 rounded-full">CTA</span>
                <p className="text-white font-semibold text-center text-sm leading-relaxed">{current.text}</p>
              </div>
            ) : (
              <div className="h-full bg-background flex flex-col p-5 gap-3">
                <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full self-start">
                  Slide {current.slide_number}
                </span>
                <p className="font-bold text-sm leading-snug">{current.headline}</p>
                <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{current.body}</p>
              </div>
            )}
          </div>

          {/* Prev / Next overlays */}
          {total > 1 && (
            <>
              <button
                onClick={() => setIdx((i) => Math.max(0, i - 1))}
                disabled={idx === 0}
                className="absolute left-1 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-background/80 border border-border flex items-center justify-center disabled:opacity-30 hover:bg-background transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}
                disabled={idx === total - 1}
                className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-background/80 border border-border flex items-center justify-center disabled:opacity-30 hover:bg-background transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}
        </div>

        {/* Dots */}
        {total > 1 && (
          <div className="flex justify-center gap-1.5">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                className={`h-1.5 rounded-full transition-all ${i === idx ? 'w-4 bg-[#0A66C2]' : 'w-1.5 bg-muted-foreground/30'}`}
              />
            ))}
          </div>
        )}

        <LinkedInEngagementBar />
      </div>
    </div>
  );
}

// ── Instagram Post ────────────────────────────────────────────────────────────

type InstagramPostBody = {
  caption?: string;
  hashtags?: string[];
  cta?: string;
  image_brief?: string;
};

function InstagramPostPreview({ body, handle, visual, onOpenDetails }: { body: InstagramPostBody; handle: string; visual?: VisualResponse; onOpenDetails?: () => void }) {
  const imageUrl = readyVisualUrl(visual);
  const hashtags = (body.hashtags ?? []).map((h) => (h.startsWith('#') ? h : `#${h}`));

  return (
    <div className="rounded-xl border border-border bg-background overflow-hidden">
      <div className="px-4 pt-3 pb-2 flex items-center gap-2 border-b border-border/60">
        <div className="h-4 w-4 rounded-sm bg-gradient-to-br from-yellow-400 via-pink-500 to-purple-600 shrink-0" />
        <span className="text-xs text-muted-foreground">Instagram Post preview</span>
      </div>

      {/* Post header */}
      <div className="px-3 py-2.5 flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-full p-[2px] bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600 shrink-0">
          <div className="h-full w-full rounded-full bg-background p-[2px]">
            <div className="h-full w-full rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center">
              <span className="text-white text-[8px] font-bold uppercase">{handle.charAt(0)}</span>
            </div>
          </div>
        </div>
        <p className="flex-1 text-xs font-semibold">{handle}</p>
        <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Image */}
      {imageUrl ? (
        <div className="relative">
          <img src={imageUrl} alt="" className="aspect-square w-full object-cover" />
          {onOpenDetails && (
            <button
              onClick={onOpenDetails}
              className="absolute top-2 left-2 h-7 w-7 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center transition-colors"
              title="Image details"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-white" />
            </button>
          )}
        </div>
      ) : (
        <div className="aspect-square bg-muted flex flex-col items-center justify-center gap-3 p-6 relative">
          <ImageIcon className="h-10 w-10 text-muted-foreground/30" />
          {body.image_brief && (
            <p className="text-xs text-center text-muted-foreground/70 leading-relaxed max-w-[220px]">
              {body.image_brief}
            </p>
          )}
          <span className="absolute bottom-2 right-2 text-[10px] text-muted-foreground/40 italic">visual brief</span>
        </div>
      )}

      {/* Engagement icons */}
      <div className="px-3 pt-2.5 pb-1 flex items-center gap-3">
        <Heart className="h-5 w-5" />
        <MessageCircle className="h-5 w-5" />
        <Send className="h-5 w-5" />
        <Bookmark className="h-5 w-5 ml-auto" />
      </div>

      {/* Caption */}
      <div className="px-3 pb-4 space-y-1">
        {(body.caption || body.cta) && (
          <p className="text-xs leading-relaxed">
            <span className="font-semibold">{handle}</span>{' '}
            {body.caption}
            {body.cta && <span className="text-muted-foreground"> {body.cta}</span>}
          </p>
        )}
        {hashtags.length > 0 && (
          <p className="text-xs text-sky-500 leading-relaxed">{hashtags.join(' ')}</p>
        )}
      </div>
    </div>
  );
}

// ── Reel Script ───────────────────────────────────────────────────────────────

type ReelScriptBody = {
  hook_3s?: string;
  full_script?: string;
  storyboard?: Array<{ shot: number; description: string; on_screen_text: string; broll: string }>;
  suggested_audio?: string;
  word_count?: number;
};

function ReelScriptPreview({ body, visual, onOpenDetails }: { body: ReelScriptBody; visual?: VisualResponse; onOpenDetails?: () => void }) {
  const [idx, setIdx] = useState(0);
  const [scriptOpen, setScriptOpen] = useState(false);
  const imageUrl = readyVisualUrl(visual);

  const shots = body.storyboard ?? [];
  const total = shots.length;
  const current = shots[Math.min(idx, total - 1)];

  return (
    <div className="rounded-xl border border-border bg-background overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-3 pb-2 flex items-center gap-2 border-b border-border/60">
        <Film className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground">
          Reel Script preview{body.word_count != null ? ` · ${body.word_count} words` : ''}
        </span>
        {body.suggested_audio && (
          <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1 truncate max-w-[140px]">
            <Volume2 className="h-3 w-3 shrink-0" />
            <span className="truncate">{body.suggested_audio}</span>
          </span>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* Hook callout */}
        {body.hook_3s && (
          <div className="bg-muted rounded-lg px-3 py-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Hook (first 3s)</p>
            <p className="text-sm font-medium leading-snug">{body.hook_3s}</p>
          </div>
        )}

        {/* Storyboard slider */}
        {total > 0 ? (
          <div className="flex flex-col items-center gap-3">
            <div className="relative flex items-center gap-2 w-full justify-center">
              {/* Prev button */}
              <button
                onClick={() => setIdx((i) => Math.max(0, i - 1))}
                disabled={idx === 0}
                className="h-8 w-8 rounded-full border border-border flex items-center justify-center disabled:opacity-30 hover:bg-muted transition-colors shrink-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              {/* Phone frame */}
              <div
                className="relative rounded-2xl border-2 border-border overflow-hidden flex flex-col"
                style={{
                  width: 180,
                  aspectRatio: '9/16',
                  backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backgroundColor: imageUrl ? undefined : 'hsl(var(--muted))',
                }}
              >
                {imageUrl && <div className="absolute inset-0 bg-black/30" />}
                {imageUrl && onOpenDetails && (
                  <button
                    onClick={onOpenDetails}
                    className="absolute top-2 left-2 z-10 h-6 w-6 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center transition-colors"
                    title="Image details"
                  >
                    <SlidersHorizontal className="h-3 w-3 text-white" />
                  </button>
                )}
                {current && (
                  <>
                    {/* Shot chip */}
                    <div className="absolute top-2 left-2 bg-black/50 text-white text-[10px] px-2 py-0.5 rounded-full" style={{ left: imageUrl && onOpenDetails ? '2.25rem' : undefined }}>
                      Shot {current.shot}
                    </div>
                    {/* On-screen text */}
                    {current.on_screen_text && (
                      <div className="absolute top-8 inset-x-2 text-center">
                        <p className="text-white text-xs font-bold leading-snug bg-black/40 rounded px-2 py-1">
                          {current.on_screen_text}
                        </p>
                      </div>
                    )}
                    {/* Description */}
                    <div className="absolute bottom-10 inset-x-3">
                      <p className="text-white text-[11px] leading-relaxed bg-black/40 rounded px-2 py-1">
                        {current.description}
                      </p>
                    </div>
                    {/* B-roll */}
                    {current.broll && (
                      <div className="absolute bottom-2 inset-x-3">
                        <p className="text-white/70 text-[10px] italic">{current.broll}</p>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Next button */}
              <button
                onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}
                disabled={idx === total - 1}
                className="h-8 w-8 rounded-full border border-border flex items-center justify-center disabled:opacity-30 hover:bg-muted transition-colors shrink-0"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Shot counter + dots */}
            <div className="flex flex-col items-center gap-1.5">
              <p className="text-xs text-muted-foreground">Shot {idx + 1} of {total}</p>
              <div className="flex gap-1.5">
                {shots.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setIdx(i)}
                    className={`h-1.5 rounded-full transition-all ${i === idx ? 'w-4 bg-foreground' : 'w-1.5 bg-muted-foreground/30'}`}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">No storyboard shots yet.</p>
        )}

        {/* Collapsible full script */}
        {body.full_script && (
          <div className="text-xs">
            <button
              onClick={() => setScriptOpen((v) => !v)}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight className={`h-3 w-3 transition-transform ${scriptOpen ? 'rotate-90' : ''}`} />
              Full script
            </button>
            {scriptOpen && (
              <pre className="mt-1.5 bg-muted/60 border border-border rounded p-2.5 overflow-auto max-h-48 whitespace-pre-wrap leading-relaxed text-[11px]">
                {body.full_script}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Blog Post ─────────────────────────────────────────────────────────────────

type BlogPostBody = {
  seo_title?: string;
  meta_description?: string;
  body?: string;
  estimated_read_time_minutes?: number;
  internal_link_suggestions?: string[];
};

function BlogPostPreview({ body, name, visual, onOpenDetails }: { body: BlogPostBody; name: string; visual?: VisualResponse; onOpenDetails?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const bodyText = body.body ?? '';
  const shouldTruncate = bodyText.length > 500;
  const initial = name.charAt(0) || 'Y';
  const imageUrl = readyVisualUrl(visual);

  return (
    <div className="rounded-xl border border-border bg-background overflow-hidden">
      <div className="px-4 pt-3 pb-2 flex items-center gap-2 border-b border-border/60">
        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground">Blog Post preview</span>
        {body.estimated_read_time_minutes != null && (
          <span className="text-xs text-muted-foreground ml-auto">{body.estimated_read_time_minutes} min read</span>
        )}
      </div>

      {imageUrl && (
        <div className="relative">
          <img src={imageUrl} alt="" className="w-full aspect-[16/9] object-cover" />
          {onOpenDetails && (
            <button
              onClick={onOpenDetails}
              className="absolute top-2 left-2 h-7 w-7 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center transition-colors"
              title="Image details"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-white" />
            </button>
          )}
        </div>
      )}
      <div className="p-4 space-y-3">
        {/* Author row */}
        <div className="flex items-center gap-2.5">
          <Avatar initial={initial} gradient="bg-gradient-to-br from-slate-400 to-slate-600" />
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-none">{name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Just now</p>
          </div>
        </div>

        {/* Title */}
        {body.seo_title && <h3 className="font-bold text-xl leading-snug">{body.seo_title}</h3>}

        {/* Meta description */}
        {body.meta_description && (
          <p className="text-sm text-muted-foreground italic leading-relaxed">{body.meta_description}</p>
        )}

        <div className="border-t border-border" />

        {/* Body */}
        {bodyText && (
          <div>
            <div className={`overflow-hidden ${!expanded && shouldTruncate ? 'max-h-48' : 'max-h-96 overflow-y-auto'}`}>
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/80">
                {bodyText}
              </p>
            </div>
            {shouldTruncate && (
              <button
                className="text-xs text-muted-foreground hover:text-foreground mt-1 transition-colors"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? 'Show less' : '…show more'}
              </button>
            )}
          </div>
        )}

        {/* Internal link suggestions */}
        {(body.internal_link_suggestions ?? []).length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Suggested internal links</p>
            <ul className="space-y-0.5">
              {(body.internal_link_suggestions ?? []).map((link, i) => (
                <li key={i} className="text-xs text-sky-500 hover:underline flex items-center gap-1">
                  <span className="text-muted-foreground">→</span>
                  {link}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

export function DraftPreview({
  format,
  contentBody,
  visual,
  onOpenDetails,
}: {
  format: DraftFormat;
  contentBody: Record<string, unknown>;
  visual?: VisualResponse;
  onOpenDetails?: () => void;
}): JSX.Element | null {
  const { data: me } = useMe();
  const name = me?.display_name ?? 'You';
  const handle = (me?.display_name ?? 'you').toLowerCase().replace(/\s+/g, '');

  // If raw_text is present, try to recover structure; fall back to the error card only if nothing works
  let body = contentBody;
  if (typeof contentBody.raw_text === 'string') {
    const recovered = tryRecoverContent(contentBody.raw_text);
    if (recovered) {
      body = recovered;
    } else {
      return <RawTextFallback format={format} rawText={contentBody.raw_text} />;
    }
  }

  if (format === 'x_thread') {
    return <XThreadPreview body={body as XThreadBody} name={name} handle={handle} />;
  }
  const visualProp = visual ? { visual } : {};
  const detailsProp = onOpenDetails ? { onOpenDetails } : {};
  if (format === 'linkedin_article') {
    return <LinkedInArticlePreview body={body as LinkedInArticleBody} name={name} handle={handle} {...visualProp} {...detailsProp} />;
  }
  if (format === 'linkedin_carousel') {
    return <LinkedInCarouselPreview body={body as LinkedInCarouselBody} name={name} handle={handle} />;
  }
  if (format === 'instagram_post') {
    return <InstagramPostPreview body={body as InstagramPostBody} handle={handle} {...visualProp} {...detailsProp} />;
  }
  if (format === 'reel_script') {
    return <ReelScriptPreview body={body as ReelScriptBody} {...visualProp} {...detailsProp} />;
  }
  if (format === 'blog_post') {
    return <BlogPostPreview body={body as BlogPostBody} name={name} {...visualProp} {...detailsProp} />;
  }
  return null;
}
