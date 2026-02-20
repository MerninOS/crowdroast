import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function HubShipmentsLoading() {
  return (
    <div>
      <div className="mb-8">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="mt-2 h-4 w-80" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, idx) => (
          <Card key={`shipment-skeleton-${idx}`} className="shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-44" />
                  <Skeleton className="h-3 w-36" />
                </div>
                <Skeleton className="h-6 w-24 rounded-full" />
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-8 w-24" />
                  <Skeleton className="h-8 w-24" />
                </div>
                <Skeleton className="h-9 w-36" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
