import { Loader2 } from "lucide-react";

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function EmptyState({ label = "No data available" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-8 text-muted-foreground">
      <span className="text-sm italic">{label}</span>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-8 text-destructive/80">
      <span className="text-sm">Failed to load: {message}</span>
    </div>
  );
}
