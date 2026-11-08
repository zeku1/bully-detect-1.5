import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "../context/AuthContext";
import {
  ShieldAlert,
  Video,
  History,
  BarChart3,
  Plus,
  Volume2,
  VolumeX,
  Upload,
  Tag,
  Users,
  LogOut,
  User as UserIcon,
} from "lucide-react";

interface HeaderProps {
  cameraCount: number;
  activeAlertCount: number;
  onAddCamera?: () => void;
  onUploadSimulation?: () => void;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  yoloLabelsEnabled?: boolean;
  onToggleYoloLabels?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onAddCamera,
  onUploadSimulation,
  soundEnabled = true,
  onToggleSound,
  yoloLabelsEnabled = true,
  onToggleYoloLabels,
}) => {
  const router = useRouter();
  const { user, logout, hasRole } = useAuth();

  const navItems = [
    { label: "Live Wall", href: "/", icon: Video, show: true },
    { label: "Incident History", href: "/history", icon: History, show: true },
    {
      label: "Reports & KPIs",
      href: "/reports",
      icon: BarChart3,
      show: hasRole(["admin", "supervisor"]),
    },
    {
      label: "Users & Access",
      href: "/users",
      icon: Users,
      show: hasRole(["admin"]),
    },
  ];

  return (
    <header className="border-b border-sentinel-border bg-sentinel-bg/95">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:block focus:p-3">Skip to content</a>
      <div className="max-w-[1600px] mx-auto px-4 sm:px-8 lg:px-10">
        <div className="flex flex-wrap items-center justify-between gap-4 py-5">
          <Link href="/" className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-500/10 border border-blue-500/25 p-2.5"><ShieldAlert className="h-6 w-6 text-blue-400" /></div>
            <div><span className="text-base font-bold tracking-[0.14em] text-white">SAFECAM <span className="text-blue-400">AI</span></span><p className="text-[10px] uppercase tracking-[0.16em] text-slate-400 mt-1">Security operations</p></div>
          </Link>
          {user && <div className="flex items-center gap-3">
            <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-full border border-sentinel-border bg-slate-800"><UserIcon className="h-4 w-4 text-slate-300" /></div>
            <div className="text-left"><p className="text-sm font-medium text-slate-200 max-w-40 truncate">{user.name}</p><p className="text-[10px] uppercase tracking-wider text-slate-400">{user.role}</p></div>
            <button onClick={logout} aria-label="Log out" title="Log out" className="toolbar-button"><LogOut className="h-4 w-4" /></button>
          </div>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 pb-4">
          <nav aria-label="Main navigation" className="flex max-w-full gap-1 overflow-x-auto py-1">
            {navItems.filter(item => item.show).map(item => {
              const Icon = item.icon;
              const active = router.pathname === item.href;
              return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
                className={"flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition " + (active ? "bg-blue-500/10 text-blue-300" : "text-slate-400 hover:bg-slate-800 hover:text-white")}>
                <Icon className="h-4 w-4" />{item.label}
              </Link>;
            })}
          </nav>
          {router.pathname === "/" && <div className="flex flex-wrap items-center gap-2">
            {onToggleSound && <button onClick={onToggleSound} aria-pressed={soundEnabled} aria-label="Alert audio" className="toolbar-button">{soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}<span>{soundEnabled ? "Audio on" : "Muted"}</span></button>}
            {onToggleYoloLabels && <button onClick={onToggleYoloLabels} aria-pressed={yoloLabelsEnabled} className="toolbar-button"><Tag className="h-4 w-4" />Labels {yoloLabelsEnabled ? "on" : "off"}</button>}
            {hasRole(["admin"]) && onUploadSimulation && <button onClick={onUploadSimulation} className="toolbar-button"><Upload className="h-4 w-4" />Simulate video</button>}
            {hasRole(["admin"]) && onAddCamera && <button onClick={onAddCamera} className="primary-button"><Plus className="h-4 w-4" />Add camera</button>}
          </div>}
        </div>
      </div>
    </header>
  );
};
