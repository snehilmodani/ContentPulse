'use client';

import Link from 'next/link';
import { useTrendRuns } from '@/lib/hooks/use-ideas';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity, ChevronRight, Clock } from 'lucide-react';

const STATUS_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  completed: 'default',
  running: 'secondary',
  failed: 'destructive',
  pending: 'outline',
  partial: 'outline',
};

export default function TrendRunsPage() {
  const { data: runsData, isLoading } = useTrendRuns(1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Trend Runs</h1>
        <p className="text-muted-foreground">All nightly pipeline runs and their generated ideas</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Runs</CardTitle>
          <CardDescription>{runsData?.meta.total ?? 0} total runs</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (runsData?.data ?? []).length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="h-8 w-8 mx-auto mb-2" />
              <p>No trend runs yet. Your first run is scheduled for 9 PM in your timezone.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {runsData?.data.map((run) => (
                <Link key={run.id} href={`/trend-runs/${run.id}`}>
                  <div className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer">
                    <div className="flex items-center gap-3">
                      <Activity className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{run.run_date}</p>
                        <p className="text-sm text-muted-foreground">
                          {run.trend_count} trends · {run.idea_count} ideas · {run.pending_idea_count} pending
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={STATUS_COLORS[run.status] ?? 'outline'}>{run.status}</Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
