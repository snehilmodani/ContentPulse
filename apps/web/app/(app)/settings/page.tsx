'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useAuthStore } from '@/lib/stores/auth';
import { apiFetch } from '@/lib/api-client';
import { useMe } from '@/lib/hooks/use-auth';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle } from 'lucide-react';

interface SettingsForm {
  display_name: string;
  timezone: string;
  email_notifications: boolean;
  push_notifications: boolean;
}

export default function SettingsPage() {
  const { user } = useAuthStore();
  const { data: me } = useMe();
  const queryClient = useQueryClient();

  const { register, handleSubmit, reset, formState: { isSubmitting, isSubmitSuccessful } } = useForm<SettingsForm>();

  useEffect(() => {
    if (me) {
      reset({
        display_name: me.display_name ?? '',
        timezone: me.timezone,
        email_notifications: me.email_notifications,
        push_notifications: me.push_notifications,
      });
    }
  }, [me, reset]);

  const onSubmit = async (data: SettingsForm) => {
    await apiFetch(`/users/${user!.id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    await queryClient.invalidateQueries({ queryKey: ['me'] });
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account preferences</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="display_name">Display Name</Label>
              <Input id="display_name" {...register('display_name')} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Input id="timezone" placeholder="e.g., Asia/Kolkata" {...register('timezone')} />
              <p className="text-xs text-muted-foreground">The scheduler fires your pipeline at 9 PM in this timezone</p>
            </div>

            <div className="space-y-3">
              <Label>Notifications</Label>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="email_notifications" {...register('email_notifications')} />
                <Label htmlFor="email_notifications" className="font-normal">Email notifications</Label>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="push_notifications" {...register('push_notifications')} />
                <Label htmlFor="push_notifications" className="font-normal">Push notifications</Label>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save Settings'}
              </Button>
              {isSubmitSuccessful && (
                <div className="flex items-center gap-1 text-sm text-green-600">
                  <CheckCircle className="h-4 w-4" /> Saved
                </div>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Email: <span className="text-foreground">{me?.email}</span></p>
          <p>Member since: <span className="text-foreground">{me ? new Date(me.created_at).toLocaleDateString() : '—'}</span></p>
        </CardContent>
      </Card>
    </div>
  );
}
