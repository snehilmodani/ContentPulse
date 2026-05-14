'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { usePackage, usePackageDrafts, useApproveDraft, useRejectDraft, useRegenerateDraft, useExportPackage } from '@/lib/hooks/use-packages';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { CheckCircle, XCircle, RefreshCw, Download, Loader2 } from 'lucide-react';
import type { DraftResponse } from '@contentpulse/types';

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

  const contentPreview = JSON.stringify(draft.content_body, null, 2).slice(0, 300);

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
        <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-40 whitespace-pre-wrap">
          {contentPreview}
          {contentPreview.length >= 300 ? '...' : ''}
        </pre>

        <div className="flex items-center gap-2">
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

export default function PackagePage() {
  const params = useParams();
  const packageId = params['id'] as string;
  const { data: pkg, isLoading: pkgLoading } = usePackage(packageId);
  const isDrafting = pkg?.status === 'drafting';
  const { data: draftsData, isLoading: draftsLoading } = usePackageDrafts(packageId, isDrafting);
  const exportPackage = useExportPackage();

  const pkgStatus = pkg?.status ?? 'pending';
  const drafts = draftsData?.data ?? [];
  const showPipeline = IN_FLIGHT.has(pkgStatus);

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
