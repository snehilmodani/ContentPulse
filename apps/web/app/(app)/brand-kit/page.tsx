'use client';

import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { useBrandKit, useUpsertBrandKit, useUploadLogo } from '@/lib/hooks/use-profile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { UpsertBrandKitBody } from '@contentpulse/types';
import { CheckCircle, Upload } from 'lucide-react';
import Image from 'next/image';

export default function BrandKitPage() {
  const { data: kit, isLoading } = useBrandKit();
  const upsert = useUpsertBrandKit();
  const uploadLogo = useUploadLogo();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting, isSubmitSuccessful } } = useForm<UpsertBrandKitBody & { primary_colors_raw: string }>();

  useEffect(() => {
    if (kit) {
      reset({
        primary_colors_raw: kit.primary_colors.join(', '),
        branding_mode: kit.branding_mode,
      });
    }
  }, [kit, reset]);

  const onSubmit = async (data: UpsertBrandKitBody & { primary_colors_raw: string }) => {
    await upsert.mutateAsync({
      primary_colors: data.primary_colors_raw.split(',').map((s) => s.trim()).filter(Boolean),
      branding_mode: data.branding_mode,
    });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadLogo.mutateAsync(file);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold">Brand Kit</h1>
        <p className="text-muted-foreground">Define your visual identity for generated content</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Logo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {kit?.logo_url && (
            <div className="relative h-24 w-24 rounded-lg overflow-hidden border">
              <Image src={kit.logo_url} alt="Logo" fill className="object-contain" />
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadLogo.isPending}
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            {uploadLogo.isPending ? 'Uploading...' : 'Upload Logo'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Brand Colors & Style</CardTitle>
          <CardDescription>Applied to AI-generated visuals</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="primary_colors_raw">Primary Colors (hex, comma-separated)</Label>
                <Input id="primary_colors_raw" placeholder="#3B82F6, #1E40AF, #FFFFFF" {...register('primary_colors_raw')} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="branding_mode">Branding Mode</Label>
                <select
                  id="branding_mode"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  {...register('branding_mode')}
                >
                  <option value="flexible">Flexible — apply brand loosely</option>
                  <option value="strict">Strict — always apply brand guidelines</option>
                </select>
              </div>

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Save Brand Kit'}
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
