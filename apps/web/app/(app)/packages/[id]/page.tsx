'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  usePackage,
  usePackageBrief,
  usePackageDrafts,
  useApproveDraft,
  useRejectDraft,
  useRegenerateDraft,
  useExportPackage,
} from '@/lib/hooks/use-packages';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { CheckCircle, XCircle, RefreshCw, Download, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import type { DraftResponse, TopicBriefResponse } from '@contentpulse/types';

const STATUS_BADGE: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'secondary',
  approved: 'default',
  rejected: 'destructive',
  generating: 'outline',
  regenerating: 'outline',
};

// ─── Pipeline progress ──────────────────────────────────────────────────────

type StepStatus = 'pending' | 'active' | 'done' | 'failed';

function deriveStepStatuses(pkgStatus: string): Record<'research' | 'drafts' | 'visuals', StepStatus> {
  switch (pkgStatus) {
    case 'researching': return { research: 'active',  drafts: 'pending', visuals: 'pending' };
    case 'drafting':    return { research: 'done',    drafts: 'active',  visuals: 'active'  };
    case 'ready':
    case 'approved':
    case 'exported':    return { research: 'done',    drafts: 'done',    visuals: 'done'    };
    case 'rejected':    return { research: 'failed',  drafts: 'pending', visuals: 'pending' };
    default:            return { research: 'pending', drafts: 'pending', visuals: 'pending' };
  }
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === 'done')   return <CheckCircle className="h-5 w-5 shrink-0 text-green-500" />;
  if (status === 'active') return <Loader2 className="h-5 w-5 shrink-0 animate-spin text-blue-500" />;
  if (status === 'failed') return <XCircle className="h-5 w-5 shrink-0 text-destructive" />;
  return <div className="h-5 w-5 shrink-0 rounded-full border-2 border-muted-foreground/30" />;
}

function stepLabel(status: StepStatus, activeMsg: string, doneMsg: string, pendingMsg: string) {
  if (status === 'active') return { text: activeMsg, className: 'text-blue-600' };
  if (status === 'done')   return { text: doneMsg,   className: 'text-green-600' };
  if (status === 'failed') return { text: 'Failed',  className: 'text-destructive' };
  return { text: pendingMsg, className: 'text-muted-foreground' };
}

function PipelineProgress({ pkgStatus, draftsCount }: { pkgStatus: string; draftsCount: number }) {
  const s = deriveStepStatuses(pkgStatus);

  const steps = [
    {
      key: 'research' as const,
      name: 'Research',
      ...stepLabel(s.research, 'Researching topic…', 'Topic researched', 'Not started'),
    },
    {
      key: 'drafts' as const,
      name: 'Drafts',
      ...stepLabel(
        s.drafts,
        draftsCount > 0 ? `Generating — ${draftsCount} / 5 ready` : 'Generating drafts…',
        `${draftsCount} drafts ready`,
        'Waiting for research',
      ),
    },
    {
      key: 'visuals' as const,
      name: 'Visuals',
      ...stepLabel(s.visuals, 'Generating visuals…', 'Visuals ready', 'Waiting for research'),
    },
  ];

  return (
    <Card>
      <CardContent className="py-4 divide-y divide-border">
        {steps.map((step) => (
          <div key={step.key} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <StepIcon status={s[step.key]} />
            <span className={`text-sm font-medium w-20 shrink-0 ${s[step.key] === 'pending' ? 'text-muted-foreground' : ''}`}>
              {step.name}
            </span>
            <span className={`text-sm ${step.className}`}>{step.text}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ─── Collapsible prompt block ────────────────────────────────────────────────

function PromptBlock({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-xs">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {label}
      </button>
      {open && (
        <pre className="mt-1.5 bg-muted/60 border border-border rounded p-2.5 overflow-auto max-h-48 whitespace-pre-wrap leading-relaxed">
          {text}
        </pre>
      )}
    </div>
  );
}

// ─── Research brief card ─────────────────────────────────────────────────────

function ResearchBriefCard({ brief }: { brief: TopicBriefResponse }) {
  const [open, setOpen] = useState(false);
  const meta = brief.research_meta as Record<string, unknown>;
  const promptUsed = typeof meta.prompt_used === 'string' ? meta.prompt_used : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 text-left w-full"
        >
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <CardTitle className="text-base">Research Brief</CardTitle>
        </button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-4 pt-0">
          {promptUsed && <PromptBlock label="Input prompt" text={promptUsed} />}

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Summary</p>
            <p className="text-sm leading-relaxed">{brief.topic_summary}</p>
          </div>

          {brief.key_facts.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Key facts</p>
              <ul className="space-y-1">
                {brief.key_facts.slice(0, 5).map((kf, i) => (
                  <li key={i} className="text-sm flex gap-2">
                    <span className="text-muted-foreground shrink-0">•</span>
                    <span>{kf.fact}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {brief.sources.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Sources</p>
              <ul className="space-y-0.5">
                {brief.sources.slice(0, 4).map((s, i) => (
                  <li key={i} className="text-xs text-muted-foreground truncate">
                    <a href={s.url} target="_blank" rel="noreferrer" className="hover:underline">
                      {s.title} — {s.publication}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ─── Draft card ─────────────────────────────────────────────────────────────

function DraftCard({ draft }: { draft: DraftResponse }) {
  const [regenInstruction, setRegenInstruction] = useState('');
  const [showRegen, setShowRegen] = useState(false);
  const approveDraft = useApproveDraft();
  const rejectDraft = useRejectDraft();
  const regenerateDraft = useRegenerateDraft();

  const handleRegen = async () => {
    if (!regenInstruction.trim()) return;
    await regenerateDraft.mutateAsync({ draftId: draft.id, instruction: regenInstruction });
    setShowRegen(false);
    setRegenInstruction('');
  };

  const meta = draft.generation_meta as Record<string, unknown> | undefined;
  const systemPrompt = typeof meta?.system_prompt === 'string' ? meta.system_prompt : null;
  const promptUsed = typeof meta?.prompt_used === 'string' ? meta.prompt_used : null;
  const model = typeof meta?.model === 'string' ? meta.model.split('/').pop() : null;
  const inputTokens = typeof meta?.input_tokens === 'number' ? meta.input_tokens : null;
  const outputTokens = typeof meta?.output_tokens === 'number' ? meta.output_tokens : null;
  const cacheTokens = typeof meta?.cache_read_tokens === 'number' ? meta.cache_read_tokens : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium capitalize">
            {draft.format.replace(/_/g, ' ')}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={STATUS_BADGE[draft.status] ?? 'outline'}>{draft.status}</Badge>
            <span className="text-xs text-muted-foreground">v{draft.version}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {(systemPrompt ?? promptUsed) && (
          <div className="space-y-1.5">
            {systemPrompt && <PromptBlock label="System prompt" text={systemPrompt} />}
            {promptUsed && <PromptBlock label="User prompt" text={promptUsed} />}
          </div>
        )}

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Output</p>
          <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-56 whitespace-pre-wrap">
            {JSON.stringify(draft.content_body, null, 2)}
          </pre>
        </div>

        {model && (
          <p className="text-xs text-muted-foreground">
            {model}
            {inputTokens !== null && ` · ${inputTokens} in`}
            {outputTokens !== null && ` / ${outputTokens} out`}
            {cacheTokens !== null && cacheTokens > 0 && ` · ${cacheTokens} cached`}
          </p>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          {draft.status !== 'approved' && (
            <Button size="sm" onClick={() => approveDraft.mutate(draft.id)} disabled={approveDraft.isPending} className="gap-1">
              <CheckCircle className="h-3 w-3" /> Approve
            </Button>
          )}
          {draft.status !== 'rejected' && (
            <Button size="sm" variant="destructive" onClick={() => rejectDraft.mutate({ draftId: draft.id })} disabled={rejectDraft.isPending} className="gap-1">
              <XCircle className="h-3 w-3" /> Reject
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setShowRegen(!showRegen)} className="gap-1">
            <RefreshCw className="h-3 w-3" /> Regenerate
          </Button>
        </div>

        {showRegen && (
          <div className="flex gap-2">
            <Input
              placeholder="Instruction (e.g., make it more engaging)"
              value={regenInstruction}
              onChange={(e) => setRegenInstruction(e.target.value)}
              className="text-sm"
            />
            <Button size="sm" onClick={handleRegen} disabled={regenerateDraft.isPending}>
              {regenerateDraft.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Apply'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

const IN_FLIGHT = new Set(['pending', 'researching', 'drafting', 'rejected']);
const BRIEF_VISIBLE = new Set(['drafting', 'ready', 'approved', 'exported']);

export default function PackagePage() {
  const params = useParams();
  const packageId = params['id'] as string;
  const queryClient = useQueryClient();
  const { data: pkg, isLoading: pkgLoading } = usePackage(packageId);
  const isDrafting = pkg?.status === 'drafting';
  const { data: draftsData, isLoading: draftsLoading } = usePackageDrafts(packageId, isDrafting);
  const pkgStatus = pkg?.status ?? 'pending';
  const { data: brief } = usePackageBrief(packageId, BRIEF_VISIBLE.has(pkgStatus));
  const exportPackage = useExportPackage();

  // When the package leaves an in-flight state, force a final refresh of drafts + brief
  // so the UI reflects the completed generation without waiting for a stale poll cycle.
  const prevStatusRef = useRef<string | undefined>();
  useEffect(() => {
    if (!pkg?.status) return;
    const prev = prevStatusRef.current;
    prevStatusRef.current = pkg.status;
    if (prev && IN_FLIGHT.has(prev) && !IN_FLIGHT.has(pkg.status)) {
      void queryClient.invalidateQueries({ queryKey: ['packages', packageId, 'drafts'] });
      void queryClient.invalidateQueries({ queryKey: ['packages', packageId, 'brief'] });
    }
  }, [pkg?.status, packageId, queryClient]);
  const drafts = draftsData?.data ?? [];
  const showPipeline = IN_FLIGHT.has(pkgStatus);
  const showBrief = BRIEF_VISIBLE.has(pkgStatus) && !!brief;

  const pageSubtitle: Record<string, string> = {
    pending: 'Waiting to start',
    researching: 'Pipeline running',
    drafting: 'Pipeline running',
    ready: 'Ready for review',
    approved: 'Approved',
    exported: 'Exported',
    rejected: 'Generation failed',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Content Package</h1>
          {pkgLoading ? (
            <Skeleton className="h-5 w-40 mt-1" />
          ) : (
            <p className="text-muted-foreground">{pageSubtitle[pkgStatus]}</p>
          )}
        </div>
        {(pkgStatus === 'ready' || pkgStatus === 'approved') && (
          <Button onClick={() => exportPackage.mutate(packageId)} disabled={exportPackage.isPending} className="gap-2">
            {exportPackage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export Package
          </Button>
        )}
        {pkg?.export_url && (
          <Button asChild variant="outline" className="gap-2">
            <a href={pkg.export_url} download>
              <Download className="h-4 w-4" /> Download
            </a>
          </Button>
        )}
      </div>

      {pkgLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : showPipeline ? (
        <PipelineProgress pkgStatus={pkgStatus} draftsCount={drafts.length} />
      ) : null}

      {showBrief && <ResearchBriefCard brief={brief} />}

      <div className="space-y-3">
        <h2 className="text-xl font-semibold">Drafts ({drafts.length})</h2>
        {pkgLoading || draftsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-64 w-full" />)}
          </div>
        ) : drafts.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <p>Drafts will appear here once generation is complete.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {drafts.map((draft) => (
              <DraftCard key={draft.id} draft={draft} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
