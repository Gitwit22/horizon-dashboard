import { Zap } from "lucide-react";
import { useSkillStats } from "@/hooks/useHorizonData";
import { LoadingState, EmptyState } from "@/components/DataStates";

export function SkillExecutionStats() {
  const { data: skills, loading } = useSkillStats();

  if (loading) return <LoadingState label="Loading skills..." />;
  if (!skills || skills.length === 0) return <EmptyState label="No skill data available." />;

  const maxRuns = Math.max(...skills.map((s) => s.runs), 1);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">Skill Execution</h2>
        <span className="text-xs text-muted-foreground ml-auto">today</span>
      </div>
      <div className="space-y-2">
        {skills.map((s) => (
          <div key={s.name} className="flex items-center gap-3">
            <span className="text-xs font-mono text-foreground w-36 truncate">{s.name}</span>
            <div className="flex-1 h-5 bg-secondary rounded-sm overflow-hidden">
              {s.runs > 0 && (
                <div
                  className="h-full bg-primary/60 rounded-sm transition-all"
                  style={{ width: `${(s.runs / maxRuns) * 100}%` }}
                />
              )}
            </div>
            <span className="text-xs font-mono text-muted-foreground w-16 text-right">
              {s.status === "pending" ? (
                <span className="text-warning">pending</span>
              ) : (
                `${s.runs} runs`
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
