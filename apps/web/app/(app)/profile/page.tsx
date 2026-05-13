'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useDomainProfile, useUpsertDomainProfile } from '@/lib/hooks/use-profile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { UpsertDomainProfileBody } from '@contentpulse/types';
import { CheckCircle } from 'lucide-react';

export default function ProfilePage() {
  const { data: profile, isLoading } = useDomainProfile();
  const upsert = useUpsertDomainProfile();
  const { register, handleSubmit, reset, formState: { errors, isSubmitting, isSubmitSuccessful } } = useForm<UpsertDomainProfileBody & { tone_of_voice_raw: string; sub_domains_raw: string }>();

  useEffect(() => {
    if (profile) {
      reset({
        primary_domain: profile.primary_domain,
        target_audience: profile.target_audience ?? '',
        creator_persona: profile.creator_persona ?? '',
        region: profile.region,
        tone_of_voice_raw: profile.tone_of_voice.join(', '),
        sub_domains_raw: profile.sub_domains.join(', '),
      });
    }
  }, [profile, reset]);

  const onSubmit = async (data: UpsertDomainProfileBody & { tone_of_voice_raw: string; sub_domains_raw: string }) => {
    await upsert.mutateAsync({
      primary_domain: data.primary_domain,
      target_audience: data.target_audience,
      creator_persona: data.creator_persona,
      region: data.region,
      tone_of_voice: data.tone_of_voice_raw.split(',').map((s) => s.trim()).filter(Boolean),
      sub_domains: data.sub_domains_raw.split(',').map((s) => s.trim()).filter(Boolean),
    });
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold">Domain Profile</h1>
        <p className="text-muted-foreground">Define your content niche and creator identity</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your Niche</CardTitle>
          <CardDescription>This information shapes how Claude understands your content strategy</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="primary_domain">Primary Domain *</Label>
                <Input id="primary_domain" placeholder="e.g., AI & Product Management" {...register('primary_domain', { required: 'Primary domain is required' })} />
                {errors.primary_domain && <p className="text-sm text-destructive">{errors.primary_domain.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="sub_domains_raw">Sub-domains (comma-separated)</Label>
                <Input id="sub_domains_raw" placeholder="e.g., SaaS, startup, no-code" {...register('sub_domains_raw')} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="target_audience">Target Audience</Label>
                <Input id="target_audience" placeholder="e.g., Early-stage founders, B2B SaaS PMs" {...register('target_audience')} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="creator_persona">Creator Persona</Label>
                <Input id="creator_persona" placeholder="e.g., Ex-Google PM turned indie hacker" {...register('creator_persona')} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tone_of_voice_raw">Tone of Voice (comma-separated)</Label>
                <Input id="tone_of_voice_raw" placeholder="e.g., authoritative, conversational, witty" {...register('tone_of_voice_raw')} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="region">Region</Label>
                <Input id="region" placeholder="e.g., IN-MH, US-CA" {...register('region')} />
              </div>

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Save Profile'}
                </Button>
                {isSubmitSuccessful && (
                  <div className="flex items-center gap-1 text-sm text-green-600">
                    <CheckCircle className="h-4 w-4" /> Saved
                  </div>
                )}
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
