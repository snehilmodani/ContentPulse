'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Inbox, User, Palette, Settings, LogOut, Wifi, WifiOff } from 'lucide-react';
import { useAuthStore } from '@/lib/stores/auth';
import { useWsStore } from '@/lib/stores/ws';
import { useMe } from '@/lib/hooks/use-auth';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/queue', label: 'Review Queue', icon: Inbox },
  { href: '/profile', label: 'Domain Profile', icon: User },
  { href: '/brand-kit', label: 'Brand Kit', icon: Palette },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { accessToken, user, setAuth, clearAuth } = useAuthStore();
  const { connect, connected, on } = useWsStore();
  const queryClient = useQueryClient();
  const { data: me, isLoading, error } = useMe();

  useEffect(() => {
    useAuthStore.getState().hydrate();
  }, []);

  useEffect(() => {
    if (!isLoading && !me && error) {
      router.push('/login');
    }
    if (me && !user) {
      setAuth(me, accessToken ?? '', localStorage.getItem('refresh_token') ?? '');
    }
  }, [me, isLoading, error, router, user, setAuth, accessToken]);

  useEffect(() => {
    if (accessToken) {
      connect(accessToken);
    }
  }, [accessToken, connect]);

  // invalidate relevant queries on WS events
  useEffect(() => {
    const unsubs = [
      on('ideas_ready', () => void queryClient.invalidateQueries({ queryKey: ['trend-runs'] })),
      on('package_ready', () => void queryClient.invalidateQueries({ queryKey: ['packages'] })),
      on('draft_regenerated', () => void queryClient.invalidateQueries({ queryKey: ['packages'] })),
      on('visual_regenerated', () => void queryClient.invalidateQueries({ queryKey: ['packages'] })),
      on('export_ready', () => void queryClient.invalidateQueries({ queryKey: ['packages'] })),
    ];
    return () => unsubs.forEach((unsub) => unsub());
  }, [on, queryClient]);

  const handleLogout = async () => {
    await apiFetch('/auth/logout', { method: 'POST' }).catch(() => {});
    clearAuth();
    router.push('/login');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 border-r bg-card flex flex-col">
        <div className="p-6 border-b">
          <h1 className="font-bold text-lg">ContentPulse</h1>
          <p className="text-xs text-muted-foreground truncate">{me?.email ?? ''}</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              <Button variant="ghost" className="w-full justify-start gap-2">
                <item.icon className="h-4 w-4" />
                {item.label}
              </Button>
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-3">
            {connected ? (
              <><Wifi className="h-3 w-3 text-green-500" /> Live</>
            ) : (
              <><WifiOff className="h-3 w-3 text-muted-foreground" /> Offline</>
            )}
          </div>
          <Button variant="ghost" className="w-full justify-start gap-2 text-destructive" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto p-8">
        {children}
      </main>
    </div>
  );
}
