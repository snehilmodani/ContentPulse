'use client';

import Link from 'next/link';
import { usePackagesList } from '@/lib/hooks/use-packages';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronRight, Package } from 'lucide-react';

const STATUS_BADGE: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending:     'outline',
  researching: 'secondary',
  drafting:    'secondary',
  ready:       'default',
  approved:    'default',
  exported:    'default',
  rejected:    'destructive',
};

const STATUS_LABEL: Record<string, string> = {
  pending:     'Pending',
  researching: 'Researching',
  drafting:    'Drafting',
  ready:       'Ready',
  approved:    'Approved',
  exported:    'Exported',
  rejected:    'Failed',
};

export default function PackagesPage() {
  const { data, isLoading } = usePackagesList();
  const packages = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Content Packages</h1>
        <p className="text-muted-foreground">{packages.length} packages total</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : packages.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Package className="h-10 w-10 mx-auto mb-3" />
            <p className="text-lg font-medium">No packages yet</p>
            <p className="text-sm">Approve an idea from the Review Queue to generate your first package.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {packages.map((pkg) => (
            <Link key={pkg.id} href={`/packages/${pkg.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="py-4 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{pkg.hook_line ?? 'Untitled package'}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(pkg.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge variant={STATUS_BADGE[pkg.status] ?? 'outline'}>
                      {STATUS_LABEL[pkg.status] ?? pkg.status}
                    </Badge>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
