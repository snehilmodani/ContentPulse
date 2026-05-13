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

export default function PackagePage() {
  const params = useParams();
  const packageId = params['id'] as string;
  const { data: pkg, isLoading: pkgLoading } = usePackage(packageId);
  const { data: draftsData, isLoading: draftsLoading } = usePackageDrafts(packageId);
  const exportPackage = useExportPackage();

  const isLoading = pkgLoading || draftsLoading;
  const drafts = draftsData?.data ?? [];
  const pipelineStatuses: Record<string, string> = {
    pending: 'Waiting to start',
    researching: 'Researching topic...',
    drafting: 'Generating drafts...',
    ready: 'Ready for review',
    approved: 'Approved',
    exported: 'Exported',
    rejected: 'Rejected',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Content Package</h1>
          {isLoading ? (
            <Skeleton className="h-5 w-40 mt-1" />
          ) : (
            <p className="text-muted-foreground">{pipelineStatuses[pkg?.status ?? 'pending']}</p>
          )}
        </div>
        {pkg?.status === 'ready' || pkg?.status === 'approved' ? (
          <Button
            onClick={() => exportPackage.mutate(packageId)}
            disabled={exportPackage.isPending}
            className="gap-2"
          >
            {exportPackage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export Package
          </Button>
        ) : null}
        {pkg?.export_url && (
          <Button asChild variant="outline" className="gap-2">
            <a href={pkg.export_url} download>
              <Download className="h-4 w-4" /> Download
            </a>
          </Button>
        )}
      </div>

      {(pkg?.status === 'researching' || pkg?.status === 'drafting') && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="py-4 flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            <p className="text-sm text-blue-800">{pipelineStatuses[pkg.status]}</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <h2 className="text-xl font-semibold">Drafts ({drafts.length})</h2>
        {isLoading ? (
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
