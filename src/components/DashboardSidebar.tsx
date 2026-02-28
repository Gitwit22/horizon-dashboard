import logo from "@/assets/logo.png";
import { Activity, List, LayoutDashboard, MessageSquare, Settings } from "lucide-react";

const items = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "runs", label: "Runs", icon: List },
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "heartbeat", label: "Heartbeat", icon: Activity },
  { id: "settings", label: "Settings", icon: Settings },
];

export function DashboardSidebar({ active, onNavigate }: { active: string; onNavigate: (id: string) => void }) {
  return (
    <aside className="w-16 lg:w-56 bg-card border-r border-border flex flex-col shrink-0">
      <div className="flex items-center gap-3 px-3 py-5 border-b border-border">
        <img src={logo} alt="Horizon" className="h-8 w-8 object-contain" />
        <span className="text-gradient-fire font-bold text-lg hidden lg:block tracking-tight">Horizon</span>
      </div>
      <nav className="flex-1 py-3 space-y-1 px-2">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
              active === item.id
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            }`}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="hidden lg:block">{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="px-3 py-4 border-t border-border">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground hidden lg:block">Console v0.1</p>
      </div>
    </aside>
  );
}
