'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useTrendRun, useTrendRunIdeas, useApproveIdea, useRejectIdea, useDeferIdea } from '@/lib/hooks/use-ideas';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, CheckCircle, XCircle, Clock } from 'lucide-react';
import type { IdeaListItem } from '@contentpulse/types';

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

const RUN_STATUS_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  completed: 'default',
  running: 'secondary',
  failed: 'destructive',
  pending: 'outline',
  partial: 'outline',
};

function IdeaCard({ idea, onApprove, onReject, onDefer, isLoading }: {
  idea: IdeaListItem;
  onApprove: () => void;
  onReject: () => void;
  onDefer: () => void;
  isLoading: boolean;
}) {
  const isPending = idea.status === 'pending';

  return (
    <Card className="hover:shadow-md transition-shadow">
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
              {!isPending && (
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
        <div className="flex items-center gap-2 flex-wrap">
          {idea.platform_fit.map((p) => (
            <Badge key={p} variant="outline" className="text-xs">{p}</Badge>
          ))}
        </div>
        {isPending && (
          <div className="flex items-center gap-2 mt-4">
            <Button size="sm" onClick={onApprove} disabled={isLoading} className="gap-1">
              <CheckCircle className="h-3 w-3" />
              Approve
            </Button>
            <Button size="sm" variant="outline" onClick={onDefer} disabled={isLoading} className="gap-1">
              <Clock className="h-3 w-3" />
              Defer
            </Button>
            <Button size="sm" variant="destructive" onClick={onReject} disabled={isLoading} className="gap-1">
              <XCircle className="h-3 w-3" />
              Reject
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function TrendRunIdeasPage() {
  const params = useParams();
  const runId = params['id'] as string;
  const router = useRouter();
  const { data: run, isLoading: runLoading } = useTrendRun(runId);
  const { data: ideasData, isLoading: ideasLoading } = useTrendRunIdeas(runId);
  const approveIdea = useApproveIdea();
  const rejectIdea = useRejectIdea();
  const deferIdea = useDeferIdea();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const ideas = (ideasData as { data: IdeaListItem[] } | undefined)?.data ?? [];
  const pendingCount = ideas.filter((i) => i.status === 'pending').length;

  const handleApprove = async (idea: IdeaListItem) => {
    setLoadingId(idea.id);
    try {
      const result = await approveIdea.mutateAsync(idea.id);
      router.push(`/packages/${result.content_package.id}`);
    } finally {
      setLoadingId(null);
    }
  };

  const handleReject = async (idea: IdeaListItem) => {
    setLoadingId(idea.id);
    try {
      await rejectIdea.mutateAsync({ ideaId: idea.id });
    } finally {
      setLoadingId(null);
    }
  };

  const handleDefer = async (idea: IdeaListItem) => {
    setLoadingId(idea.id);
    try {
      await deferIdea.mutateAsync(idea.id);
    } finally {
      setLoadingId(null);
    }
  };

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
                  {ideas.length} ideas · {pendingCount} pending
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
              onApprove={() => void handleApprove(idea)}
              onReject={() => void handleReject(idea)}
              onDefer={() => void handleDefer(idea)}
              isLoading={loadingId === idea.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
