'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useTrendRuns, useCreateTrendRun } from '@/lib/hooks/use-ideas';
import { useDomainProfile } from '@/lib/hooks/use-profile';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Activity, ChevronRight, Clock } from 'lucide-react';
import { ApiError } from '@/lib/api-client';

const STATUS_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  completed: 'default',
  running: 'secondary',
  failed: 'destructive',
  pending: 'outline',
  partial: 'outline',
};

export default function TrendRunsPage() {
  const { data: runsData, isLoading } = useTrendRuns(1);
  const createRun = useCreateTrendRun();
  const { data: profileData, isLoading: profileLoading, isError: profileMissing } = useDomainProfile();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [trendCap, setTrendCap] = useState(3);
  const [primaryDomain, setPrimaryDomain] = useState('');
  const [subDomainsRaw, setSubDomainsRaw] = useState('');
  const [region, setRegion] = useState('');
  const [toneOfVoiceRaw, setToneOfVoiceRaw] = useState('');

  useEffect(() => {
    if (dialogOpen && profileData) {
      setPrimaryDomain(profileData.primary_domain);
      setSubDomainsRaw(profileData.sub_domains.join(', '));
      setRegion(profileData.region);
      setToneOfVoiceRaw(profileData.tone_of_voice.join(', '));
    }
  }, [dialogOpen, profileData]);

  function handleClose() {
    setDialogOpen(false);
    createRun.reset();
    setPrimaryDomain('');
    setSubDomainsRaw('');
    setRegion('');
    setToneOfVoiceRaw('');
    setTrendCap(3);
  }

  function handleStart() {
    createRun.mutate(
      {
        trend_cap: trendCap,
        domain_override: {
          primary_domain: primaryDomain.trim(),
          sub_domains: subDomainsRaw.split(',').map((s) => s.trim()).filter(Boolean),
          region: region.trim(),
          tone_of_voice: toneOfVoiceRaw.split(',').map((s) => s.trim()).filter(Boolean),
        },
      },
      { onSuccess: handleClose },
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Trend Runs</h1>
          <p className="text-muted-foreground">All nightly pipeline runs and their generated ideas</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Start New Run
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Start a new trend run</DialogTitle>
            <DialogDescription>
              Review your domain settings below. Changes here only affect this run — your saved profile won&apos;t be modified.
            </DialogDescription>
          </DialogHeader>

          {profileLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : profileMissing ? (
            <div className="rounded-md border border-dashed p-6 text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                You need to set up a domain profile before starting a trend run.
              </p>
              <Button variant="outline" size="sm" asChild>
                <Link href="/profile">Complete domain profile</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Domain settings</p>
                <div className="space-y-2">
                  <Label htmlFor="primary-domain">Primary domain</Label>
                  <Input
                    id="primary-domain"
                    placeholder="e.g., AI & Productivity"
                    value={primaryDomain}
                    onChange={(e) => setPrimaryDomain(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sub-domains">Sub-domains (comma-separated)</Label>
                  <Input
                    id="sub-domains"
                    placeholder="e.g., SaaS, no-code, automation"
                    value={subDomainsRaw}
                    onChange={(e) => setSubDomainsRaw(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="region">Region</Label>
                  <Input
                    id="region"
                    placeholder="e.g., IN-MH"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tone-of-voice">Tone of voice (comma-separated)</Label>
                  <Input
                    id="tone-of-voice"
                    placeholder="e.g., authoritative, conversational"
                    value={toneOfVoiceRaw}
                    onChange={(e) => setToneOfVoiceRaw(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2 border-t pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Run options</p>
                <Label htmlFor="trend-cap">Trend cap (1–20)</Label>
                <Input
                  id="trend-cap"
                  type="number"
                  min={1}
                  max={20}
                  value={trendCap}
                  onChange={(e) => setTrendCap(Math.max(1, Math.min(20, Number(e.target.value))))}
                />
              </div>
            </div>
          )}

          {createRun.isError && (
            <p className="text-sm text-destructive">
              {createRun.error instanceof ApiError ? createRun.error.message : 'Something went wrong'}
            </p>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={createRun.isPending}>Cancel</Button>
            </DialogClose>
            <Button
              onClick={handleStart}
              disabled={createRun.isPending || profileLoading || profileMissing}
            >
              {createRun.isPending ? 'Starting…' : 'Start'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
