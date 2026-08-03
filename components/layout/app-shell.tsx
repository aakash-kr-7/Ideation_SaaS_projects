"use client";

import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  ChevronDown,
  Circle,
  Command,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Scale,
  Search,
  Settings,
  User,
  X,
} from "lucide-react";
import { Brand } from "./brand";
import { LegalFooter } from "./legal-footer";
import { ProductTour } from "./product-tour";
import { useAuth } from "./auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MagneticButton } from "@/components/ui/magnetic-button";
import { ModalTransition, PanelTransition } from "@/components/ui/panel-transition";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, description: "Validation pipeline and next actions", keywords: "home overview reports" },
  { href: "/research/new", label: "Validate idea", icon: Plus, description: "Start a market-backed validation", keywords: "new research scan" },
  { href: "/compare", label: "Compare ideas", icon: Scale, description: "Compare completed reports side by side", keywords: "matrix score" },
  { href: "/dashboard/scoring", label: "Scoring model", icon: BarChart3, description: "Inspect criteria and decision weights", keywords: "weights criteria" },
  { href: "/pricing", label: "Pricing", icon: CreditCard, description: "Plans and validation depth", keywords: "billing plan" },
  { href: "/settings", label: "Settings", icon: Settings, description: "Profile and workspace preferences", keywords: "account profile" },
];

const pageContext: Record<string, string> = {
  Dashboard: "Your validation pipeline, ranked by what deserves attention next.",
  "Validate idea": "Brief the market. Pressure-test the assumptions. Earn the next move.",
  Compare: "Put competing ideas under the same decision criteria.",
  "Scoring model": "See exactly what is carrying—or weakening—the verdict.",
  Pricing: "Choose the depth of evidence the decision deserves.",
  Settings: "Tune the decision system to the way you actually build.",
};

function isActiveNavigation(href: string, pathname: string) {
  if (href === "/dashboard") {
    return pathname === "/dashboard" || (pathname.startsWith("/research/") && pathname !== "/research/new");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function TourAutoStarter({ onStartTour, tourCompleted }: { onStartTour: () => void; tourCompleted?: boolean }) {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("tour") === "start" && !tourCompleted) {
      onStartTour();
      const url = new URL(window.location.href);
      url.searchParams.delete("tour");
      window.history.replaceState({}, "", url.toString());
    }
  }, [searchParams, tourCompleted, onStartTour]);

  return null;
}

export function AppShell({ children, title, action }: { children: ReactNode; title: string; action?: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [quickNavOpen, setQuickNavOpen] = useState(false);
  const [quickNavQuery, setQuickNavQuery] = useState("");
  const [quickNavIndex, setQuickNavIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const quickNavInputRef = useRef<HTMLInputElement>(null);
  const filteredLinks = useMemo(() => {
    const query = quickNavQuery.trim().toLowerCase();
    return query
      ? links.filter((item) => `${item.label} ${item.description} ${item.keywords}`.toLowerCase().includes(query))
      : links;
  }, [quickNavQuery]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setQuickNavOpen((open) => !open);
      }
      if (event.key === "Escape") {
        setQuickNavOpen(false);
        setMenuOpen(false);
        setMobileNavOpen(false);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    if (!quickNavOpen) return;
    setQuickNavQuery("");
    setQuickNavIndex(0);
    requestAnimationFrame(() => quickNavInputRef.current?.focus());
  }, [quickNavOpen]);

  useEffect(() => setQuickNavIndex(0), [quickNavQuery]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const openQuickNavResult = (href: string) => {
    setQuickNavOpen(false);
    router.push(href);
  };

  const handleQuickNavKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!filteredLinks.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setQuickNavIndex((index) => (index + 1) % filteredLinks.length);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setQuickNavIndex((index) => (index - 1 + filteredLinks.length) % filteredLinks.length);
    }
    if (event.key === "Enter") {
      event.preventDefault();
      openQuickNavResult(filteredLinks[quickNavIndex]?.href ?? filteredLinks[0].href);
    }
  };

  const handleSignOut = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Could not sign out:", error);
    } finally {
      window.location.href = "/sign-in";
    }
  };

  const displayName = profile?.display_name || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";
  const avatarUrl = user?.user_metadata?.avatar_url;

  return (
    <div className="min-h-screen bg-sb-bg-base text-sb-text-primary">
      <aside
        id="app-sidebar"
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-sb-border-hairline bg-sb-bg-surface-1",
          "transition-transform duration-sb-base ease-sb-standard md:translate-x-0",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="border-b border-sb-border-hairline px-sb-5 py-sb-4">
          <Brand href="/dashboard" />
        </div>

        <div className="mx-sb-4 mt-sb-4 flex items-center gap-sb-3 rounded-sb-md border border-sb-border-hairline bg-sb-bg-surface-2 p-sb-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-sb-sm border border-sb-border-hairline bg-sb-bg-surface-1" aria-hidden="true">
            <Image src="/brand/shouldbuild-mark.svg" alt="" width={24} height={24}/>
          </span>
          <span className="min-w-0 flex-1">
            <b className="block truncate text-sm font-medium">Decision room</b>
            <small className="block truncate text-xs text-sb-text-tertiary">Current workspace</small>
          </span>
          <ChevronDown className="text-sb-text-tertiary" size={14} aria-hidden="true"/>
        </div>

        <p className="mb-sb-2 mt-sb-6 px-sb-5 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">Decision system</p>
        <nav className="flex flex-col gap-sb-1 px-sb-3" aria-label="Main navigation">
          {links.map(({ href, label, icon: Icon, description }) => {
            const active = isActiveNavigation(href, pathname);
            return (
              <MagneticButton className="w-full" key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex min-h-10 w-full items-center gap-sb-3 rounded-sb-md px-sb-3 py-sb-2 text-sm",
                    "transition-[background-color,color,transform] duration-sb-fast ease-sb-standard active:scale-[0.97]",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus",
                    active
                      ? "bg-sb-accent-muted text-sb-accent"
                      : "text-sb-text-secondary hover:bg-sb-bg-surface-2 hover:text-sb-text-primary",
                  )}
                  onClick={() => setMobileNavOpen(false)}
                  data-tour={`nav-${href.split("/").filter(Boolean).join("-")}`}
                  data-preview={description}
                >
                  {active && <span className="absolute inset-y-sb-2 left-0 w-0.5 rounded-sb-pill bg-sb-accent" aria-hidden="true"/>}
                  <Icon size={16} aria-hidden="true"/>
                  <span>{label}</span>
                </Link>
              </MagneticButton>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-sb-border-hairline p-sb-4">
          <div className="flex items-start gap-sb-3 rounded-sb-md bg-sb-bg-surface-2 p-sb-3 text-sb-text-secondary">
            <Circle className="mt-1 shrink-0 text-sb-text-tertiary" size={8} fill="currentColor" aria-hidden="true"/>
            <span>
              <b className="block text-xs font-medium text-sb-text-primary">{user ? "Private workspace" : "Explore ShouldBuild"}</b>
              <small className="mt-sb-1 block text-xs leading-relaxed text-sb-text-tertiary">
                {user ? "Evidence stays attached to every verdict." : "Sign in when an idea deserves a full evidence trail."}
              </small>
            </span>
          </div>
          <p className="mb-0 mt-sb-3 text-xs uppercase tracking-[0.02em] text-sb-text-tertiary">ShouldBuild · Evidence first</p>
        </div>
      </aside>

      <div className="min-h-screen md:pl-72">
        <header className="sticky top-0 z-30 flex min-h-20 items-center justify-between gap-sb-4 border-b border-sb-border-hairline bg-sb-bg-base px-sb-4 py-sb-3 md:px-sb-6">
          <div className="flex min-w-0 items-center gap-sb-3">
            <Button
              variant="ghost"
              className="shrink-0 px-sb-3 md:hidden"
              onClick={() => setMobileNavOpen((open) => !open)}
              aria-label="Toggle navigation"
              aria-expanded={mobileNavOpen}
              aria-controls="app-sidebar"
            >
              <Menu size={18}/>
            </Button>
            <div className="min-w-0">
              <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">Decision room / {title}</p>
              <h1 className="m-0 truncate font-sb-display text-2xl font-[480] tracking-[-0.01em]">{title}</h1>
              <p className="m-0 hidden truncate text-xs text-sb-text-secondary lg:block">{pageContext[title] ?? "Evidence first. Commitment second."}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-sb-2">
            <Button variant="secondary" className="hidden lg:inline-flex" onClick={() => setQuickNavOpen(true)} aria-label="Open quick navigation">
              <Search size={14}/><span>Jump anywhere</span><kbd className="rounded-sb-sm border border-sb-border-hairline px-sb-1 font-sb-mono text-xs text-sb-text-tertiary">{mounted && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"} K</kbd>
            </Button>
            {action}
            {loading ? (
              <span className="size-9 rounded-sb-pill border border-sb-border-hairline bg-sb-bg-surface-2" aria-label="Loading account"/>
            ) : !user ? (
              <Link className="rounded-sb-md px-sb-3 py-sb-2 text-sm text-sb-text-secondary hover:bg-sb-bg-surface-1 hover:text-sb-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus" href={`/sign-in?redirectTo=${encodeURIComponent(pathname)}`}>Sign in</Link>
            ) : (
              <div className="relative" ref={menuRef}>
                <Button
                  variant="ghost"
                  className="px-sb-2"
                  onClick={() => setMenuOpen((open) => !open)}
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                  aria-label={`Open profile menu for ${displayName}`}
                >
                  {mounted && avatarUrl ? (
                    <img src={avatarUrl} alt="" referrerPolicy="no-referrer" className="size-7 rounded-sb-pill object-cover"/>
                  ) : (
                    <span className="grid size-7 place-items-center rounded-sb-pill border border-sb-border-hairline bg-sb-bg-surface-2 text-xs font-medium">{displayName[0].toUpperCase()}</span>
                  )}
                  <span className="hidden max-w-32 truncate text-sm sm:inline">{displayName}</span>
                  <ChevronDown className={cn("text-sb-text-tertiary transition-transform duration-sb-fast ease-sb-standard", menuOpen && "rotate-180")} size={14}/>
                </Button>

                <PanelTransition
                  isOpen={menuOpen && mounted}
                  variant="popover"
                  className="absolute right-0 top-[calc(100%+var(--sb-space-2))] z-50 w-64"
                >
                  <Card className="bg-sb-bg-surface-2 p-sb-2" role="menu" aria-label="Profile menu">
                    <div className="border-b border-sb-border-hairline px-sb-3 py-sb-3">
                      <b className="block truncate text-sm font-medium">{displayName}</b>
                      <small className="block truncate text-xs text-sb-text-tertiary">{user.email}</small>
                    </div>
                    <Link href="/settings" role="menuitem" className="mt-sb-2 flex min-h-10 items-center gap-sb-2 rounded-sb-md px-sb-3 py-sb-2 text-sm text-sb-text-secondary hover:bg-sb-bg-surface-3 hover:text-sb-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus" onClick={() => setMenuOpen(false)}>
                      <User size={14}/> Profile &amp; Settings
                    </Link>
                    <Button variant="ghost" role="menuitem" className="w-full justify-start" onClick={() => { setMenuOpen(false); setTourOpen(true); }}>
                      <BookOpen size={14}/> Take Product Tour
                    </Button>
                    <div className="my-sb-2 border-t border-sb-border-hairline"/>
                    <Button variant="destructive" role="menuitem" className="w-full justify-start" onClick={handleSignOut}>
                      <LogOut size={14}/> Sign out
                    </Button>
                  </Card>
                </PanelTransition>
              </div>
            )}
          </div>
        </header>

        <main className="min-h-[calc(100vh-5rem)]">
          <div key={pathname} className="min-w-0" data-tour="page-canvas">{children}</div>
        </main>
        <LegalFooter compact/>
      </div>

      <PanelTransition
        isOpen={mobileNavOpen}
        variant="fade"
        className="fixed inset-0 z-30 md:hidden"
      >
        <button
          type="button"
          className="absolute inset-0 cursor-default [background:color-mix(in_srgb,var(--sb-bg-base)_82%,transparent)]"
          onClick={() => setMobileNavOpen(false)}
          aria-label="Close navigation"
        />
      </PanelTransition>

      <ModalTransition
        isOpen={quickNavOpen}
        overlayProps={{
          className: "fixed inset-0 z-50 grid place-items-start px-sb-4 pt-[12vh] [background:color-mix(in_srgb,var(--sb-bg-base)_82%,transparent)]",
          onMouseDown: () => setQuickNavOpen(false),
        }}
        panelProps={{
          className: "w-full max-w-xl",
          role: "dialog",
          "aria-modal": true,
          "aria-label": "Quick navigation",
          onMouseDown: (event) => event.stopPropagation(),
        }}
      >
          <Card className="w-full bg-sb-bg-surface-2">
            <header className="flex items-center gap-sb-3 border-b border-sb-border-hairline p-sb-3">
              <Search className="shrink-0 text-sb-text-tertiary" size={17}/>
              <Input ref={quickNavInputRef} className="border-0 bg-transparent p-0 focus:border-transparent focus-visible:outline-offset-4" value={quickNavQuery} onChange={(event) => setQuickNavQuery(event.target.value)} onKeyDown={handleQuickNavKeyDown} placeholder="Go to a page…" aria-label="Search pages" aria-controls="quick-nav-results"/>
              <Button variant="ghost" className="min-h-8 px-sb-2 py-sb-1" onClick={() => setQuickNavOpen(false)} aria-label="Close quick navigation"><X size={14}/></Button>
            </header>
            <div id="quick-nav-results" className="max-h-[55vh] overflow-y-auto p-sb-2" role="listbox">
              <p className="m-0 px-sb-3 py-sb-2 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">Navigate</p>
              {filteredLinks.map(({ href, label, icon: Icon, description }, index) => (
                <Button
                  key={href}
                  variant="ghost"
                  role="option"
                  aria-selected={index === quickNavIndex}
                  className={cn("mb-sb-1 w-full justify-start px-sb-3 text-left", index === quickNavIndex && "bg-sb-bg-surface-3 text-sb-text-primary")}
                  onMouseEnter={() => setQuickNavIndex(index)}
                  onClick={() => openQuickNavResult(href)}
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-sb-sm border border-sb-border-hairline bg-sb-bg-surface-1"><Icon size={15}/></span>
                  <span className="min-w-0 flex-1"><b className="block text-sm font-medium">{label}</b><small className="block truncate text-xs text-sb-text-tertiary">{description}</small></span>
                  <ArrowRight className="text-sb-text-tertiary" size={14}/>
                </Button>
              ))}
              {!filteredLinks.length && (
                <div className="grid justify-items-center gap-sb-2 px-sb-4 py-sb-8 text-center text-sb-text-tertiary">
                  <Command size={18}/><b className="text-sm font-medium text-sb-text-secondary">No matching page</b><small>Try “report”, “pricing”, or “settings”.</small>
                </div>
              )}
            </div>
            <footer className="flex gap-sb-4 border-t border-sb-border-hairline px-sb-4 py-sb-3 text-xs text-sb-text-tertiary">
              <span><kbd className="font-sb-mono">↑ ↓</kbd> select</span><span><kbd className="font-sb-mono">↵</kbd> open</span><span><kbd className="font-sb-mono">Esc</kbd> close</span>
            </footer>
          </Card>
      </ModalTransition>

      {user && (
        <Suspense fallback={null}>
          <TourAutoStarter onStartTour={() => setTourOpen(true)} tourCompleted={profile?.tour_completed}/>
        </Suspense>
      )}

      <ProductTour isOpen={Boolean(user && tourOpen)} onClose={() => setTourOpen(false)} onComplete={() => setTourOpen(false)}/>
    </div>
  );
}
