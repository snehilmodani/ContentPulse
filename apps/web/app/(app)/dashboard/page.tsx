'use client';

import Link from 'next/link';
import { useAuthStore } from '@/lib/stores/auth';
import { useTrendRuns } from '@/lib/hooks/use-ideas';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, FileText, Clock, CheckCircle } from 'lucide-react';

const STATUS_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  completed: 'default',
  running: 'secondary',
  failed: 'destructive',
  pending: 'outline',
  partial: 'outline',
};

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { data: runsData, isLoading } = useTrendRuns(1);

  const todayRun = runsData?.data[0];
  const totalPending = runsData?.data.reduce((sum, r) => sum + r.pending_idea_count, 0) ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Welcome back{user?.display_name ? `, ${user.display_name}` : ''}</h1>
        <p className="text-muted-foreground">Here&apos;s your content pipeline status.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Today&apos;s Run</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : todayRun ? (
              <>
                <div className="text-2xl font-bold">{todayRun.trend_count} trends</div>
                <Badge variant={STATUS_COLORS[todayRun.status] ?? 'outline'} className="mt-1">
                  {todayRun.status}
                </Badge>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">No run today yet — scheduled for 9 PM</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Ideas to Review</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold">{totalPending}</div>
                <p className="text-xs text-muted-foreground">pending approval</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Runs</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold">{runsData?.meta.total ?? 0}</div>
                <p className="text-xs text-muted-foreground">all time</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Trend Runs</CardTitle>
          <CardDescription>Your nightly content pipeline history</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (runsData?.data ?? []).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-8 w-8 mx-auto mb-2" />
              <p>No trend runs yet. Your first run is scheduled for 9 PM in your timezone.</p>
              <Link href="/profile">
                <Button variant="outline" className="mt-4">Set up your profile</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {runsData?.data.map((run) => (
                <div key={run.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <p className="font-medium">{run.run_date}</p>
                    <p className="text-sm text-muted-foreground">
                      {run.trend_count} trends · {run.idea_count} ideas · {run.pending_idea_count} pending
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_COLORS[run.status] ?? 'outline'}>{run.status}</Badge>
                    {run.pending_idea_count > 0 && (
                      <Link href="/queue">
                        <Button size="sm">Review</Button>
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
