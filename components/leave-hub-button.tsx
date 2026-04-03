"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/mernin/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { LogOut } from "lucide-react";

export function LeaveHubButton({ hubName }: { hubName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [blockingLots, setBlockingLots] = useState<string[]>([]);

  const handleLeave = async () => {
    setIsLoading(true);
    setBlockingLots([]);

    const res = await fetch("/api/hub-members/leave", { method: "POST" });
    const result = await res.json();

    if (!res.ok) {
      if (res.status === 409 && result.blocking_lots) {
        setBlockingLots(result.blocking_lots);
      } else {
        toast.error(result.error || "Something went sideways");
        setOpen(false);
      }
    } else {
      toast.success("Done. You're good.");
      setOpen(false);
      router.push("/dashboard");
      router.refresh();
    }
    setIsLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setBlockingLots([]); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <LogOut className="mr-1 h-3.5 w-3.5" />
          Leave Hub
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Leave {hubName}?</DialogTitle>
          <DialogDescription>
            You won't be able to see new lots from this hub. Your past commitments and order history will remain.
          </DialogDescription>
        </DialogHeader>

        {blockingLots.length > 0 ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-destructive">
              You can't leave yet — you have open commitments:
            </p>
            <ul className="list-disc pl-5 text-sm text-muted-foreground">
              {blockingLots.map((lot) => (
                <li key={lot}>{lot}</li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Wait for these lots to close before leaving.
            </p>
            <Button variant="outline" className="w-full" onClick={() => setOpen(false)}>
              Got it
            </Button>
          </div>
        ) : (
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={handleLeave}
              disabled={isLoading}
            >
              {isLoading ? "Leaving..." : "Leave Hub"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
