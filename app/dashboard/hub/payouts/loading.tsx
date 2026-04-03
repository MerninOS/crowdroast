import { Card, CardContent, CardHeader } from "@/components/mernin/Card";
import { Skeleton } from "@/components/ui/skeleton";

export default function HubPayoutsLoading() {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Skeleton className="h-8 w-44" />
        <Skeleton className="mt-2 h-4 w-80" />
      </div>
      <Card className="shadow-sm">
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-9 w-44" />
        </CardContent>
      </Card>
    </div>
  );
}
