'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  useTrendRun, useTrendRunIdeas, useIdea,
  useApproveIdea, useRejectIdea, useDeferIdea, useUpdateIdea,
} from '@/lib/hooks/use-ideas';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, CheckCircle, XCircle, Clock, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { IdeaListItem, PublishedPlatform } from '@contentpulse/types';

const PLATFORM_OPTIONS: PublishedPlatform[] = ['x_twitter', 'linkedin', 'instagram', 'youtube'];

const PLATFORM_LABELS: Record<PublishedPlatform, string> = {
  x_twitter: 'X (Twitter)',
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  youtube: 'YouTube',
};

function normalizePlatform(raw: string): PublishedPlatform | null {
  const s = raw.trim().toLowerCase();
  if (s === 'x_twitter' || s === 'twitter' || s === 'x') return 'x_twitter';
  if (s === 'linkedin' || s === 'linkedin_article' || s === 'linkedin_carousel') return 'linkedin';
  if (s === 'instagram' || s === 'instagram_post' || s === 'reel_script') return 'instagram';
  if (s === 'youtube' || s === 'yt') return 'youtube';
  return null;
}

const ANGLE_COLORS: Record<string, string> = {
  news: 'bg-blue-100 text-blue-800',
  innovation: 'bg-purple-100 text-purple-800',
  contrarian: 'bg-orange-100 text-orange-800',
  comedic: 'bg-yellow-100 text-yellow-800',
  tangential_insight: 'bg-green-100 text-green-800',
  how_to: 'bg-gray-100 text-gray-800',
};

const STATUS_BADGE: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  approved: 'default',
  rejected: 'destructive',
  deferred: 'outline',
  pending: 'secondary',
};

const STATUS_BG: Record<string, string> = {
  approved: 'bg-green-50 border-green-200',
  deferred: 'bg-amber-50 border-amber-200',
  rejected: 'bg-red-50 border-red-200',
  pending: '',
};

const RUN_STATUS_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  completed: 'default',
  running: 'secondary',
  failed: 'destructive',
  pending: 'outline',
  partial: 'outline',
};

function IdeaCard({ idea, onOpen }: { idea: IdeaListItem; onOpen: () => void }) {
  return (
    <Card className={cn('transition-colors duration-500', STATUS_BG[idea.status])}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ANGLE_COLORS[idea.angle_type] ?? 'bg-gray-100 text-gray-800'}`}>
                {idea.angle_type.replace(/_/g, ' ')}
              </span>
              <span className="text-xs text-muted-foreground">
                Score: {parseFloat(idea.relevance_score).toFixed(0)}
              </span>
              {idea.status !== 'pending' && (
                <Badge variant={STATUS_BADGE[idea.status] ?? 'outline'} className="text-xs">
                  {idea.status}
                </Badge>
              )}
            </div>
            <CardTitle className="text-base leading-snug">{idea.hook_line}</CardTitle>
          </div>
        </div>
        {idea.trend && (
          <CardDescription className="text-xs">
            Trend: {idea.trend.topic_name} · {idea.trend.source_platform}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 flex-wrap mb-4">
          {idea.platform_fit.map((p) => (
            <Badge key={p} variant="outline" className="text-xs">{p.replace(/_/g, ' ')}</Badge>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={onOpen}>
          Review
        </Button>
      </CardContent>
    </Card>
  );
}

function IdeaDetailModal({ ideaId, onClose }: { ideaId: string | null; onClose: () => void }) {
  const { data: idea, isLoading } = useIdea(ideaId);
  const approveIdea = useApproveIdea();
  const rejectIdea = useRejectIdea();
  const deferIdea = useDeferIdea();
  const updateIdea = useUpdateIdea();

  const [isEditing, setIsEditing] = useState(false);
  const [editHook, setEditHook] = useState('');
  const [editArgument, setEditArgument] = useState('');
  const [editPlatforms, setEditPlatforms] = useState<PublishedPlatform[]>([]);

  // Reset edit state when modal closes or idea changes
  useEffect(() => {
    setIsEditing(false);
  }, [ideaId]);

  const enterEdit = () => {
    if (!idea) return;
    setEditHook(idea.hook_line);
    setEditArgument(idea.core_argument);
    setEditPlatforms((idea.platform_fit as DraftFormat[]) ?? []);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
  };

  const togglePlatform = (p: DraftFormat) => {
    setEditPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  };

  const handleSave = async () => {
    if (!idea) return;
    await updateIdea.mutateAsync({
      ideaId: idea.id,
      body: { hook_line: editHook, core_argument: editArgument, platform_fit: editPlatforms },
    });
    setIsEditing(false);
  };

  const handleClose = () => {
    setIsEditing(false);
    onClose();
  };

  const isPending = idea?.status === 'pending';
  const isActionPending = approveIdea.isPending || rejectIdea.isPending || deferIdea.isPending;
  const canSave = editHook.trim().length > 0 && editArgument.trim().length > 0 && !updateIdea.isPending;

  const handleApprove = async () => {
    if (!idea) return;
    await approveIdea.mutateAsync(idea.id);
    handleClose();
  };

  const handleDefer = async () => {
    if (!idea) return;
    await deferIdea.mutateAsync(idea.id);
    handleClose();
  };

  const handleReject = async () => {
    if (!idea) return;
    await rejectIdea.mutateAsync({ ideaId: idea.id });
    handleClose();
  };

  return (
    <Dialog open={!!ideaId} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        {isLoading || !idea ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ANGLE_COLORS[idea.angle_type] ?? 'bg-gray-100 text-gray-800'}`}>
                  {idea.angle_type.replace(/_/g, ' ')}
                </span>
                <span className="text-xs text-muted-foreground">
                  Score: {parseFloat(idea.relevance_score).toFixed(0)}
                </span>
                {idea.status !== 'pending' && (
                  <Badge variant={STATUS_BADGE[idea.status] ?? 'outline'} className="text-xs">
                    {idea.status}
                  </Badge>
                )}
                {isPending && !isEditing && (
                  <Button size="sm" variant="ghost" className="h-6 px-2 ml-auto gap-1 text-xs" onClick={enterEdit}>
                    <Pencil className="h-3 w-3" />
                    Edit
                  </Button>
                )}
              </div>
              {isEditing ? (
                <Input
                  value={editHook}
                  onChange={(e) => setEditHook(e.target.value)}
                  maxLength={280}
                  className="text-base font-semibold"
                />
              ) : (
                <DialogTitle className="leading-snug">{idea.hook_line}</DialogTitle>
              )}
            </DialogHeader>

            <div className="space-y-4 text-sm">
              <div>
                <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide mb-1">Core argument</p>
                {isEditing ? (
                  <Textarea
                    value={editArgument}
                    onChange={(e) => setEditArgument(e.target.value)}
                    rows={6}
                    maxLength={2000}
                  />
                ) : (
                  <p className="leading-relaxed">{idea.core_argument}</p>
                )}
              </div>

              <div className="flex items-start gap-4 flex-wrap">
                <div>
                  <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide mb-1">Effort</p>
                  <Badge variant="outline">{idea.effort_estimate}</Badge>
                </div>
                <div className="flex-1">
                  <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide mb-1">Platform fit</p>
                  {isEditing ? (
                    <div className="flex gap-1.5 flex-wrap">
                      {PLATFORM_OPTIONS.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => togglePlatform(p)}
                          className={cn(
                            'text-xs px-2 py-0.5 rounded-full border transition-colors',
                            editPlatforms.includes(p)
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-transparent text-foreground border-input hover:bg-muted',
                          )}
                        >
                          {p.replace(/_/g, ' ')}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex gap-1 flex-wrap">
                      {idea.platform_fit.map((p) => (
                        <Badge key={p} variant="outline" className="text-xs">{p.replace(/_/g, ' ')}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {idea.trend && (
                <div className="rounded-md border p-3 bg-muted/30 space-y-1">
                  <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide">Trend</p>
                  <p className="font-medium">{idea.trend.topic_name}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                    <span>{idea.trend.category?.replace(/_/g, ' ')}</span>
                    <span>·</span>
                    <span>{idea.trend.source_platform}</span>
                    <span>·</span>
                    <span>score {parseFloat(idea.trend.composite_score).toFixed(0)}</span>
                  </div>
                </div>
              )}
            </div>

            {isEditing ? (
              <DialogFooter className="gap-2 sm:gap-2">
                <Button size="sm" variant="outline" onClick={cancelEdit} disabled={updateIdea.isPending}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave} disabled={!canSave}>
                  Save
                </Button>
              </DialogFooter>
            ) : isPending ? (
              <DialogFooter className="gap-2 sm:gap-2">
                <Button size="sm" variant="destructive" onClick={handleReject} disabled={isActionPending} className="gap-1">
                  <XCircle className="h-3 w-3" />
                  Reject
                </Button>
                <Button size="sm" variant="outline" onClick={handleDefer} disabled={isActionPending} className="gap-1">
                  <Clock className="h-3 w-3" />
                  Defer
                </Button>
                <Button size="sm" onClick={handleApprove} disabled={isActionPending} className="gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Approve
                </Button>
              </DialogFooter>
            ) : null}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function TrendRunIdeasPage() {
  const params = useParams();
  const runId = params['id'] as string;
  const { data: run, isLoading: runLoading } = useTrendRun(runId);
  const { data: ideasData, isLoading: ideasLoading } = useTrendRunIdeas(runId);
  const [openIdeaId, setOpenIdeaId] = useState<string | null>(null);

  const ideas = ideasData?.data ?? [];
  const totalIdeaCount = ideasData?.meta?.total ?? ideas.length;
  const pendingCount = ideas.filter((i) => i.status === 'pending').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/trend-runs">
          <Button variant="ghost" size="sm" className="gap-1">
            <ArrowLeft className="h-4 w-4" />
            All Runs
          </Button>
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          {runLoading ? (
            <Skeleton className="h-8 w-48" />
          ) : (
            <>
              <h1 className="text-3xl font-bold">{run?.run_date ?? runId}</h1>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={RUN_STATUS_COLORS[run?.status ?? ''] ?? 'outline'}>
                  {run?.status}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {totalIdeaCount} ideas · {pendingCount} pending
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {ideasLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48 w-full" />)}
        </div>
      ) : ideas.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <p className="text-lg font-medium">No ideas for this run</p>
            <p className="text-sm">This run may still be processing.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ideas.map((idea) => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              onOpen={() => setOpenIdeaId(idea.id)}
            />
          ))}
        </div>
      )}

      <IdeaDetailModal
        ideaId={openIdeaId}
        onClose={() => setOpenIdeaId(null)}
      />
    </div>
  );
}
