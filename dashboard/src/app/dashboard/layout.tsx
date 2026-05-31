import Link from "next/link";
import {
  Activity,
  Server,
  ScrollText,
  BarChart3,
  Database,
  Settings,
  Globe,
  Layers,
  Palette,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Status", icon: Activity },
  { href: "/dashboard/services", label: "Services", icon: Server },
  { href: "/dashboard/datasets", label: "Datasets", icon: Database },
  { href: "/dashboard/layers", label: "Layers", icon: Layers },
  { href: "/dashboard/styles", label: "Styles", icon: Palette },
  { href: "/dashboard/logs", label: "Logs", icon: ScrollText },
  { href: "/dashboard/metrics", label: "Metrics", icon: BarChart3 },
  { href: "/dashboard/migrations", label: "Migrations", icon: Globe },
  { href: "/dashboard/config", label: "Configuration", icon: Settings },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card flex flex-col">
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-2">
            <Globe className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold">GeoLang</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Platform Dashboard
          </p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Connected to local Docker
          </p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-8 overflow-auto">{children}</main>
    </div>
  );
}
