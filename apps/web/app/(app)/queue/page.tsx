'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTrendRuns, useTrendRunIdeas, useApproveIdea, useRejectIdea, useDeferIdea } from '@/lib/hooks/use-ideas';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle, XCircle, Clock, ChevronRight } from 'lucide-react';
import type { IdeaListItem } from '@contentpulse/types';

const ANGLE_COLORS: Record<string, string> = {
  news: 'bg-blue-100 text-blue-800',
  innovation: 'bg-purple-100 text-purple-800',
  contrarian: 'bg-orange-100 text-orange-800',
  comedic: 'bg-yellow-100 text-yellow-800',
  tangential_insight: 'bg-green-100 text-green-800',
  how_to: 'bg-gray-100 text-gray-800',
};

function IdeaCard({ idea, onApprove, onReject, onDefer, isLoading }: {
  idea: IdeaListItem;
  onApprove: () => void;
  onReject: () => void;
  onDefer: () => void;
  isLoading: boolean;
}) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ANGLE_COLORS[idea.angle_type] ?? 'bg-gray-100 text-gray-800'}`}>
                {idea.angle_type.replace(/_/g, ' ')}
              </span>
              <span className="text-xs text-muted-foreground">
                Score: {parseFloat(idea.relevance_score).toFixed(0)}
              </span>
            </div>
            <CardTitle className="text-base leading-snug">{idea.hook_line}</CardTitle>
          </div>
        </div>
        <CardDescription className="text-xs">
          Trend: {idea.trend.topic_name} · {idea.trend.source_platform}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          {idea.platform_fit.map((p) => (
            <Badge key={p} variant="outline" className="text-xs">{p}</Badge>
          ))}
        </div>
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
      </CardContent>
    </Card>
  );
}

export default function QueuePage() {
  const router = useRouter();
  const { data: runsData } = useTrendRuns(1);
  const latestRunId = runsData?.data[0]?.id ?? '';
  const { data: ideasData, isLoading } = useTrendRunIdeas(latestRunId);
  const approveIdea = useApproveIdea();
  const rejectIdea = useRejectIdea();
  const deferIdea = useDeferIdea();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const ideas = (ideasData as { data: IdeaListItem[] } | undefined)?.data ?? [];
  const pendingIdeas = ideas.filter((i) => i.status === 'pending');

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
      <div>
        <h1 className="text-3xl font-bold">Review Queue</h1>
        <p className="text-muted-foreground">{pendingIdeas.length} ideas waiting for your decision</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48 w-full" />)}
        </div>
      ) : pendingIdeas.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <CheckCircle className="h-10 w-10 mx-auto mb-3 text-green-500" />
            <p className="text-lg font-medium">All caught up!</p>
            <p className="text-sm">New ideas will appear after tonight&apos;s pipeline run.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pendingIdeas.map((idea) => (
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
