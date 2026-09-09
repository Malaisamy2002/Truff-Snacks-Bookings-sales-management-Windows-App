import { lazy, Suspense, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Cookie,
  FileText,
  Wallet,
  BookOpen,
  BarChart3,
  Trophy,
  Settings,
  LayoutDashboard,
} from "lucide-react";
import { ArchiveYearDialog } from "@/components/app/ArchiveYearDialog";
import { DesktopFirstRunNotice } from "@/components/app/DesktopFirstRunNotice";
import { YearSwitcher } from "@/components/app/YearSwitcher";
import { ScrollEdgeButton } from "@/components/app/ScrollEdgeButton";
import { DataEntryShortcuts, ShortcutsHintButton } from "@/components/app/DataEntryShortcuts";
import { BUSINESS_NAME } from "@/lib/biz";
import { usePrintSettings } from "@/lib/print";
import { usePersistedState } from "@/lib/ui-prefs";
import { useLayoutPrefs, visibleTabIds } from "@/lib/layout-prefs";

import { backupReminderDue, readAppSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

const TITLE = "Turf Bookings & Sales — Booking, Billing & Reports";
const DESC =
  "Calculate turf bookings, generate numbered invoices with PDF receipts, track expenses and profit, and share bills on WhatsApp.";

// Keep startup focused on the selected tab. Reports, Settings and exports
// pull in chart/PDF/Excel dependencies that do not belong in every launch.
const DashboardTab = lazy(() =>
  import("@/components/app/DashboardTab").then(({ DashboardTab }) => ({ default: DashboardTab })),
);
const TurfTab = lazy(() =>
  import("@/components/app/TurfTab").then(({ TurfTab }) => ({ default: TurfTab })),
);
const SnacksTab = lazy(() =>
  import("@/components/app/SnacksTab").then(({ SnacksTab }) => ({ default: SnacksTab })),
);
const BillsTab = lazy(() =>
  import("@/components/app/BillsTab").then(({ BillsTab }) => ({ default: BillsTab })),
);
const ExpensesTab = lazy(() =>
  import("@/components/app/ExpensesTab").then(({ ExpensesTab }) => ({ default: ExpensesTab })),
);
const DuesTab = lazy(() =>
  import("@/components/app/DuesTab").then(({ DuesTab }) => ({ default: DuesTab })),
);
const ReportsTab = lazy(() =>
  import("@/components/app/ReportsTab").then(({ ReportsTab }) => ({ default: ReportsTab })),
);
const SettingsTab = lazy(() =>
  import("@/components/app/SettingsTab").then(({ SettingsTab }) => ({ default: SettingsTab })),
);

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const TABS = [
  { id: "home", label: "Home", icon: LayoutDashboard },
  { id: "turf", label: "Turf", icon: Trophy },
  { id: "snacks", label: "Snacks", icon: Cookie },
  { id: "bills", label: "Bills", icon: FileText },
  { id: "money", label: "Money", icon: Wallet },
  { id: "dues", label: "Dues", icon: BookOpen },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings },
] as const;

type TabId = (typeof TABS)[number]["id"];

const TAB_IDS = TABS.map((t) => t.id);

function Index() {
  const [tab, setTab] = usePersistedState<TabId>("active-tab", "home", (v) =>
    (TAB_IDS as readonly string[]).includes(v),
  );
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Settings → "Arrange this app" leaves Settings and lands on Home, where the
  // real cards are already framed by arrange mode.
  useEffect(() => {
    const onStart = () => setTab("home");
    window.addEventListener("arrange:start", onStart);
    return () => window.removeEventListener("arrange:start", onStart);
  }, [setTab]);

  const { settings: printSettings } = usePrintSettings();
  const shopTitle = printSettings.shopName.trim() || BUSINESS_NAME;

  // Tab bar follows Settings → Layout & arrangement: hidden tabs disappear and
  // the rest keep the owner's chosen order. Settings itself can never be hidden.
  const { layout } = useLayoutPrefs();
  const visibleIds = visibleTabIds(layout);
  const visibleTabs = visibleIds
    .map((id) => TABS.find((t) => t.id === id))
    .filter((t): t is (typeof TABS)[number] => Boolean(t));
  const shownTabs = visibleTabs.length ? visibleTabs : TABS.slice();
  const activeTab: TabId = shownTabs.some((t) => t.id === tab)
    ? tab
    : ((shownTabs[0]?.id ?? "settings") as TabId);
  const navTabIds = shownTabs.map((t) => t.id);

  // One-time backup reminder, per the Settings → Backup frequency.
  useEffect(() => {
    const s = readAppSettings();
    if (!backupReminderDue(s)) return;
    const t = window.setTimeout(() => {
      toast.info("Time for a backup", {
        description: `Your ${s.backupReminder} backup is due. Open Settings → Backup & restore to export.`,
        duration: 10000,
      });
    }, 4000);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-8" data-density={layout.density}>
      <ArchiveYearDialog />
      <DesktopFirstRunNotice />
      <ScrollEdgeButton />
      <ShortcutsHintButton onClick={() => setShortcutsOpen(true)} />
      <DataEntryShortcuts
        tabIds={navTabIds}
        onGoToTab={(id) => setTab(id as TabId)}
        helpOpen={shortcutsOpen}
        onHelpOpenChange={setShortcutsOpen}
      />
      <header className="sticky top-0 z-20 border-b border-white/15 brand-gradient pt-[env(safe-area-inset-top)] text-primary-foreground shadow-[0_10px_30px_-20px_oklch(0.4_0.1_250)] backdrop-blur-xl">
        <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 md:flex md:justify-between md:gap-6 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl border border-white/25 bg-white/15 backdrop-blur-md">
              <Trophy className="size-5" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold leading-tight tracking-tight md:text-lg">
                {shopTitle}
              </h1>
              <p className="truncate text-[11px] uppercase tracking-[0.08em] opacity-75">
                Booking, billing &amp; business manager
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <YearSwitcher />
          </div>

          <nav className="hidden items-center gap-1 rounded-full border border-white/20 bg-white/10 p-1 backdrop-blur-md md:flex">
            {shownTabs.map((t) => {
              const Icon = t.icon;
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-all",
                    active
                      ? "bg-background text-primary shadow-sm"
                      : "text-primary-foreground/85 hover:bg-white/15",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-2xl p-4 md:max-w-6xl md:px-8 md:py-8">
        <Suspense
          fallback={
            <div className="grid min-h-48 place-items-center text-sm text-muted-foreground">
              Loading section…
            </div>
          }
        >
          {activeTab === "home" && <DashboardTab />}
          {activeTab === "turf" && <TurfTab />}
          {activeTab === "snacks" && <SnacksTab />}
          {activeTab === "bills" && <BillsTab />}
          {activeTab === "money" && <ExpensesTab />}
          {activeTab === "dues" && <DuesTab />}
          {activeTab === "reports" && <ReportsTab />}
          {activeTab === "settings" && <SettingsTab />}
        </Suspense>
      </main>

      <nav className="frost fixed inset-x-0 bottom-0 z-20 flex overflow-x-auto border-t pb-[env(safe-area-inset-bottom)] md:hidden">
        {shownTabs.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "relative flex min-w-0 flex-1 flex-col items-center gap-1 whitespace-nowrap py-2.5 text-[11px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "grid size-8 place-items-center rounded-full transition-all",
                  active ? "bg-primary/12 shadow-[0_6px_16px_-10px_var(--primary)]" : "",
                )}
              >
                <Icon className="h-5 w-5" />
              </span>
              {t.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
