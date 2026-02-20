import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function HubOverviewLoading() {
  return (
    <div>
      <div className="mb-8">
        <Skeleton className="h-8 w-60" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 5 }).map((_, idx) => (
          <Card key={`hub-overview-skeleton-${idx}`} className="shadow-sm">
            <CardContent className="p-4 md:p-6">
              <Skeleton className="mb-3 h-9 w-9 rounded-lg" />
              <Skeleton className="h-7 w-14" />
              <Skeleton className="mt-1 h-3 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="mt-6 shadow-sm">
        <CardContent className="p-4 md:p-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <Skeleton className="h-4 w-44" />
            <Skeleton className="mt-2 h-3 w-64" />
          </div>
          <Skeleton className="h-9 w-40" />
        </CardContent>
      </Card>
    </div>
  );
}
