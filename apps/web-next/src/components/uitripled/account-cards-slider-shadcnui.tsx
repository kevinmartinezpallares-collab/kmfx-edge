"use client";

import Image from "next/image";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  AnimatedGradient,
  type CustomConfig,
} from "@/components/ui/animated-gradient";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { animate, motion, useMotionValue } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Eye,
  MoreHorizontal,
  Pencil,
  Rocket,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { AccountRow } from "@/lib/domain/accounts-selectors";
import {
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
} from "@/lib/formatters/numbers";
import { cn } from "@/lib/utils";

interface AccountCardData {
  id: string;
  title: string;
  description: string;
  broker: string;
  server: string;
  equity: string;
  pnl: string;
  category: string;
  author: {
    name: string;
    avatar: string;
  };
  date: string;
  readTime: string;
  status: string;
  account: AccountRow;
}

type AccountGradientTheme = Omit<CustomConfig, "preset" | "speed">;

const DEFAULT_LOGO_GRADIENT_THEME: AccountGradientTheme = {
  color1: "#070707",
  color2: "#1c1c1c",
  color3: "#a3a3a3",
  rotation: 45,
  proportion: 50,
  scale: 0.3,
  distortion: 10,
  swirl: 30,
  swirlIterations: 5,
  softness: 100,
  offset: 0,
  shape: "Checks",
  shapeSize: 60,
};

const LOGO_GRADIENT_THEMES = [
  {
    tokens: ["darwin"],
    theme: {
      color1: "#06111d",
      color2: "#123f8c",
      color3: "#d6e54a",
      rotation: -34,
      proportion: 56,
      scale: 0.34,
      distortion: 15,
      swirl: 36,
      swirlIterations: 6,
      softness: 92,
      offset: 80,
      shape: "Edge",
      shapeSize: 48,
    },
  },
  {
    tokens: ["ftmo"],
    theme: {
      color1: "#05080d",
      color2: "#16406f",
      color3: "#8ab4f8",
      rotation: -55,
      proportion: 54,
      scale: 0.32,
      distortion: 12,
      swirl: 36,
      swirlIterations: 6,
      softness: 96,
      offset: 60,
      shape: "Edge",
      shapeSize: 50,
    },
  },
  {
    tokens: ["orion"],
    theme: {
      color1: "#140900",
      color2: "#5a2403",
      color3: "#fb923c",
      rotation: 115,
      proportion: 62,
      scale: 0.36,
      distortion: 14,
      swirl: 34,
      swirlIterations: 8,
      softness: 90,
      offset: 220,
      shape: "Stripes",
      shapeSize: 46,
    },
  },
  {
    tokens: ["funding pips"],
    theme: {
      color1: "#03120f",
      color2: "#0b3b35",
      color3: "#5eead4",
      rotation: -25,
      proportion: 58,
      scale: 0.38,
      distortion: 18,
      swirl: 42,
      swirlIterations: 7,
      softness: 88,
      offset: 120,
      shape: "Edge",
      shapeSize: 42,
    },
  },
  {
    tokens: ["5ers", "the5ers"],
    theme: {
      color1: "#07110f",
      color2: "#0f4f46",
      color3: "#9debdc",
      rotation: 36,
      proportion: 52,
      scale: 0.34,
      distortion: 14,
      swirl: 39,
      swirlIterations: 7,
      softness: 92,
      offset: -40,
      shape: "Checks",
      shapeSize: 54,
    },
  },
  {
    tokens: ["ic markets", "icmarkets"],
    theme: {
      color1: "#100507",
      color2: "#4b1018",
      color3: "#fb7185",
      rotation: 24,
      proportion: 48,
      scale: 0.34,
      distortion: 16,
      swirl: 38,
      swirlIterations: 6,
      softness: 92,
      offset: -80,
      shape: "Checks",
      shapeSize: 54,
    },
  },
  {
    tokens: ["pepperstone"],
    theme: {
      color1: "#061005",
      color2: "#174d1f",
      color3: "#86efac",
      rotation: -18,
      proportion: 57,
      scale: 0.36,
      distortion: 15,
      swirl: 34,
      swirlIterations: 6,
      softness: 94,
      offset: 160,
      shape: "Edge",
      shapeSize: 44,
    },
  },
] satisfies Array<{
  tokens: string[];
  theme: AccountGradientTheme;
}>;

function accountStatusLabel(account: AccountRow) {
  if (account.connectionTone === "connected") return "En vivo";
  if (account.connectionTone === "syncing") return "Sincronizando";
  if (account.connectionTone === "stale") return "Desactualizada";
  if (account.connectionTone === "warning") return "Revisar";
  if (account.connectionTone === "danger") return "Error";
  return account.connectionState;
}

function planAccessLabel(account: AccountRow) {
  return account.planAccess === "limited" ? "Plan limitado" : "Plan activo";
}

function accountCategoryLabel(account: AccountRow) {
  const rawLabel = account.funding?.phaseLabel ?? account.accountKindLabel;

  return fundingPhaseLabel(rawLabel);
}

function fundingPhaseLabel(rawLabel: string) {
  const normalized = rawLabel.trim().toLowerCase();

  if (normalized === "phase 1") return "Fase 1";
  if (normalized === "phase 2") return "Fase 2";
  if (normalized.includes("funded")) return "Cuenta fondeada";

  return rawLabel;
}

function playbookLabel(rawLabel: string) {
  const labels: Record<string, string> = {
    "challenge conservative": "Reto conservador",
    "payout defense": "Defensa de cobro",
  };

  return labels[rawLabel.trim().toLowerCase()] ?? rawLabel;
}

function copyAccountLogin(account: AccountRow) {
  void navigator.clipboard?.writeText(account.login);
}

function companyName(account: AccountRow) {
  return account.funding?.firm || account.broker;
}

function companyLogoUrl(account: AccountRow) {
  const source = [
    account.funding?.firm,
    account.label,
    account.broker,
    account.server,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (source.includes("ftmo")) return "/brand-logos/ftmo.png";
  if (source.includes("darwin")) return "/brand-logos/darwinex-zero.webp";
  if (source.includes("orion")) return "/brand-logos/orion-funded.jpeg";
  if (source.includes("funding pips")) {
    return "/brand-logos/the-funding-pips.jpeg";
  }
  if (source.includes("wsf")) return "/brand-logos/wsf.png";
  if (source.includes("5ers") || source.includes("the5ers")) {
    return "/brand-logos/the5ers.png";
  }
  if (source.includes("ic markets") || source.includes("icmarkets")) {
    return "/brand-logos/ic-markets.png";
  }
  if (source.includes("pepperstone")) {
    return "/brand-logos/pepperstone.svg";
  }

  return `https://ui-avatars.com/api/?name=${encodeURIComponent(
    companyName(account),
  )}&background=111111&color=ffffff&bold=true`;
}

function AccountLogoFrame({
  src,
  alt,
  className,
  imageClassName,
  size,
}: {
  src: string;
  alt: string;
  className?: string;
  imageClassName?: string;
  size: number;
}) {
  if (src.startsWith("/")) {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden rounded-full",
          className,
        )}
      >
        <Image
          src={src}
          alt={alt}
          width={size}
          height={size}
          className={cn("size-full rounded-full object-cover", imageClassName)}
        />
      </span>
    );
  }

  return (
    <Avatar className={className}>
      <AvatarImage src={src} alt={alt} className={imageClassName} />
      <AvatarFallback>{alt[0]}</AvatarFallback>
    </Avatar>
  );
}

function AccountDetailMetric({
  label,
  value,
  note,
}: {
  label: string;
  value: string | number;
  note: string;
}) {
  return (
    <div className="border-b border-border/50 py-3 last:border-b-0">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold leading-none text-foreground">
        {value}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

function AccountConnectionDetail({ account }: { account: AccountRow }) {
  const funding = account.funding;
  const [connectionKey, setConnectionKey] = useState("");
  const [keyStatus, setKeyStatus] = useState<"idle" | "loading" | "ready" | "error" | "copied">(
    "idle",
  );
  const [keyMessage, setKeyMessage] = useState(
    "La KMFX Key es única para esta cuenta MT5.",
  );

  async function revealConnectionKey() {
    setKeyStatus("loading");
    setKeyMessage("Recuperando key segura...");
    try {
      const response = await fetch(
        `/api/kmfx/accounts/${encodeURIComponent(account.id)}/connection-key`,
        { cache: "no-store" },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        connection_key?: string;
        connection_key_preview?: string;
        reason?: string;
      };
      if (!response.ok || !payload.connection_key) {
        const unavailable =
          payload.reason === "connection_key_not_available"
            ? "No se puede recuperar esta key antigua. Genera una nueva conexión para esta cuenta."
            : "No se pudo recuperar la KMFX Key. Revisa sesión, plan y permisos.";
        setConnectionKey(payload.connection_key_preview ?? "");
        setKeyStatus("error");
        setKeyMessage(unavailable);
        return;
      }
      setConnectionKey(payload.connection_key);
      setKeyStatus("ready");
      setKeyMessage("Key lista para copiar y pegar en el EA de esta cuenta.");
    } catch {
      setKeyStatus("error");
      setKeyMessage("No se pudo contactar con la API para recuperar la key.");
    }
  }

  async function copyConnectionKey() {
    if (!connectionKey) {
      await revealConnectionKey();
      return;
    }
    await navigator.clipboard.writeText(connectionKey);
    setKeyStatus("copied");
    setKeyMessage("KMFX Key copiada.");
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
    >
      <section className="overflow-hidden rounded-xl border border-border/60 bg-card/50 backdrop-blur-md">
        <div className="grid gap-0 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="relative overflow-hidden border-b border-border/50 bg-background/35 p-6 lg:border-b-0 lg:border-r">
            <div className="absolute -right-12 -top-12 size-40 rounded-full bg-white/10 blur-3xl" />
            <div className="relative flex items-start gap-4">
              <AccountLogoFrame
                src={companyLogoUrl(account)}
                alt={`${companyName(account)} logo`}
                className="size-14 border border-border/60 bg-background ring-4 ring-background"
                size={56}
              />
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                  Detalle de cuenta
                </p>
                <h3 className="mt-2 truncate text-2xl font-semibold tracking-tight text-foreground">
                  {account.label}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {companyName(account)} / {account.platform.toUpperCase()}
                </p>
              </div>
            </div>

            <div className="relative mt-6 grid gap-3">
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background/40 p-4">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Estado de conexión
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Última sincronización: {account.lastSyncLabel}
                  </p>
                </div>
                <Badge
                  variant={
                    account.connectionTone === "connected"
                      ? "outline"
                      : "secondary"
                  }
                >
                  {accountStatusLabel(account)}
                </Badge>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">KMFX Key</p>
                    <p className="mt-2 truncate font-mono text-sm text-muted-foreground">
                      {connectionKey || "•••• •••• ••••"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={connectionKey ? copyConnectionKey : revealConnectionKey}
                    disabled={keyStatus === "loading"}
                    className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border border-border/60 bg-background/70 px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-accent disabled:cursor-wait disabled:opacity-60"
                  >
                    <Copy className="size-3.5" />
                    {keyStatus === "loading"
                      ? "Cargando"
                      : keyStatus === "copied"
                        ? "Copiada"
                        : connectionKey
                          ? "Copiar"
                          : "Ver key"}
                  </button>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {keyMessage}
                </p>
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="grid gap-x-6 md:grid-cols-2 xl:grid-cols-4">
              <AccountDetailMetric
                label="Login"
                value={account.login}
                note="Identificador MT5"
              />
              <AccountDetailMetric
                label="Servidor"
                value={account.server}
                note={account.broker}
              />
              <AccountDetailMetric
                label="Plan"
                value={planAccessLabel(account)}
                note={account.planAccess === "limited" ? "Revisar límites" : "Operativo"}
              />
              <AccountDetailMetric
                label="Posiciones"
                value={account.openPositionsCount}
                note={account.openPositionsCount === 1 ? "abierta" : "abiertas"}
              />
            </div>

            <div className="mt-3 grid gap-x-6 md:grid-cols-2 xl:grid-cols-4">
              <AccountDetailMetric
                label="Balance"
                value={formatCurrency(account.balance, account.baseCurrency)}
                note={account.baseCurrency}
              />
              <AccountDetailMetric
                label="Equity"
                value={formatCurrency(account.equity, account.baseCurrency)}
                note="Lectura MT5"
              />
              <AccountDetailMetric
                label="P&L flotante"
                value={formatSignedCurrency(account.floatingPnl, account.baseCurrency)}
                note="Posiciones abiertas"
              />
              <AccountDetailMetric
                label="P&L neto"
                value={formatSignedCurrency(account.totalPnl, account.baseCurrency)}
                note="Snapshot actual"
              />
            </div>

            {funding ? (
              <div className="mt-3 grid gap-x-6 md:grid-cols-3">
                <AccountDetailMetric
                  label="Fondeo"
                  value={funding.firm}
                  note={fundingPhaseLabel(funding.phaseLabel)}
                />
                <AccountDetailMetric
                  label="Room diario"
                  value={formatPercent(funding.dailyRoomLeftPct, 1)}
                  note="Distancia al límite diario"
                />
                <AccountDetailMetric
                  label="Riesgo sugerido"
                  value={formatPercent(funding.recommendedRiskPct, 2)}
                  note={playbookLabel(funding.playbookLabel)}
                />
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </motion.div>
  );
}

function buildCards(
  accounts: AccountRow[],
  activeAccountId?: string,
): AccountCardData[] {
  const activeFirst = [...accounts].sort((left, right) => {
    if (left.id === activeAccountId) return -1;
    if (right.id === activeAccountId) return 1;
    return 0;
  });

  return activeFirst.map((account) => ({
    id: account.id,
    title: account.label,
    description: `${account.broker} / ${account.server}`,
    broker: account.broker,
    server: account.server,
    equity: formatCurrency(account.equity, account.baseCurrency),
    pnl: formatSignedCurrency(account.totalPnl, account.baseCurrency),
    category: accountCategoryLabel(account),
    author: {
      name: companyName(account),
      avatar: companyLogoUrl(account),
    },
    date: account.lastSyncLabel,
    readTime: planAccessLabel(account),
    status: accountStatusLabel(account),
    account,
  }));
}

function gradientSeedForCard(cardId: string) {
  return Array.from(cardId).reduce(
    (seed, character) => seed + character.charCodeAt(0),
    0,
  );
}

function logoGradientThemeForAccount(account: AccountRow) {
  const source = [
    companyName(account),
    account.label,
    account.broker,
    account.server,
    account.funding?.firm,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    LOGO_GRADIENT_THEMES.find(({ tokens }) =>
      tokens.some((token) => source.includes(token)),
    )?.theme ?? DEFAULT_LOGO_GRADIENT_THEME
  );
}

function gradientConfigForCard(account: AccountRow, index: number): CustomConfig {
  const idSeed = gradientSeedForCard(account.id);
  const theme = logoGradientThemeForAccount(account);
  const speed = 6 + ((idSeed + index * 3) % 10);

  return {
    preset: "custom",
    ...theme,
    offset: (theme.offset ?? 0) + (idSeed % 180),
    speed,
  };
}

export function AccountCardsSlider({
  accounts,
  activeAccountId,
}: {
  accounts: AccountRow[];
  activeAccountId?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const x = useMotionValue(0);
  const cards = useMemo(
    () => buildCards(accounts, activeAccountId),
    [accounts, activeAccountId],
  );
  const [selectedAccountId, setSelectedAccountId] = useState(
    activeAccountId ?? cards[0]?.id ?? "",
  );
  const selectedAccount =
    accounts.find((account) => account.id === selectedAccountId) ??
    accounts.find((account) => account.id === activeAccountId) ??
    accounts[0];

  useEffect(() => {
    if (containerRef.current) {
      setWidth(
        containerRef.current.scrollWidth - containerRef.current.offsetWidth,
      );
    }
  }, [cards.length]);

  const scrollTo = (direction: "left" | "right") => {
    const currentX = x.get();
    const containerWidth = containerRef.current?.offsetWidth || 0;
    const scrollAmount = containerWidth * 0.8;

    let newX =
      direction === "left" ? currentX + scrollAmount : currentX - scrollAmount;

    newX = Math.max(Math.min(newX, 0), -width);

    animate(x, newX, {
      type: "spring",
      stiffness: 300,
      damping: 30,
      mass: 1,
    });
  };

  const cardNodes = cards.map((card, index) => {
    const gradientConfig = gradientConfigForCard(card.account, index);

    return (
      <motion.div
        key={card.id}
        className="h-[500px] min-w-[320px] max-w-[320px]"
        whileHover={{ y: -10, transition: { duration: 0.3 } }}
      >
        <Card
          className={cn(
            "group relative h-full overflow-hidden rounded-3xl border-border/50 bg-card/30 p-0 backdrop-blur-md transition-all duration-500 hover:border-primary/50 hover:shadow-2xl hover:shadow-primary/10",
            selectedAccount?.id === card.id &&
              "border-primary/60 shadow-2xl shadow-primary/10",
          )}
        >
          <div className="relative h-56 overflow-hidden">
            <AnimatedGradient config={gradientConfig} />
            <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent opacity-60 transition-opacity duration-300 group-hover:opacity-40" />

          <div className="absolute left-4 top-4 z-20">
            <Badge
              variant="secondary"
              className="border-white/10 bg-background/50 px-3 py-1 text-xs font-medium backdrop-blur-md"
            >
              {card.category}
            </Badge>
          </div>

          <div className="absolute inset-x-4 bottom-4 z-20 flex items-end justify-between gap-4">
            <AccountLogoFrame
              src={card.author.avatar}
              alt={`${card.author.name} logo`}
              className="size-16 border border-white/20 bg-background/75 shadow-xl ring-4 ring-black/20"
              size={64}
            />
            <div className="min-w-0 rounded-2xl border border-white/10 bg-background/55 px-3 py-2 text-right shadow-lg backdrop-blur-md">
              <p className="truncate text-sm font-semibold text-foreground">
                {card.author.name}
              </p>
              <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                MT5 {card.account.login}
              </p>
            </div>
          </div>

          <div className="absolute right-4 top-4 z-20">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    className="grid size-11 place-items-center rounded-full border border-white/10 bg-background/55 text-foreground shadow-lg backdrop-blur-md transition-all hover:bg-background/80 active:scale-95 sm:size-9"
                    aria-label={`Abrir acciones de ${card.title}`}
                  />
                }
              >
                <MoreHorizontal className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>{card.title}</DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => setSelectedAccountId(card.id)}>
                    <Eye />
                    Ver detalles
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => copyAccountLogin(card.account)}>
                    <Copy />
                    Copiar login MT5
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem disabled>
                    <Pencil />
                    Editar cuenta
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      Pendiente
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled>
                    <Rocket />
                    Abrir launcher
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      Pendiente
                    </span>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled
                  variant="destructive"
                  className="text-destructive focus:bg-destructive/10 focus:text-destructive [&_svg]:text-destructive"
                >
                  <Trash2 />
                  Eliminar cuenta
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    Pendiente
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/20 opacity-0 backdrop-blur-[2px] transition-opacity duration-300 group-hover:opacity-100">
            <motion.button
              type="button"
              onClick={() => setSelectedAccountId(card.id)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex min-h-11 items-center gap-2 rounded-full bg-white/90 px-5 py-2 text-sm font-semibold text-black shadow-lg sm:min-h-9"
            >
              Ver detalles
            </motion.button>
          </div>
        </div>

        <div className="flex h-[calc(100%-14rem)] flex-col justify-between p-5 pb-6">
          <div className="flex flex-col gap-4">
            <h3 className="text-xl font-bold leading-tight tracking-tight text-foreground transition-colors group-hover:text-primary">
              {card.title}
            </h3>
            <div className="grid gap-3 text-sm leading-relaxed">
              <div className="grid grid-cols-[70px_1fr] items-baseline gap-3">
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Broker
                </p>
                <p className="truncate text-right font-medium text-foreground">
                  {card.broker}
                </p>
              </div>
              <div className="grid grid-cols-[70px_1fr] items-baseline gap-3">
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Servidor
                </p>
                <p className="truncate text-right text-muted-foreground">
                  {card.server}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl border border-border/50 bg-background/30 p-3">
                  <p className="text-[10px] text-muted-foreground">Equity</p>
                  <p className="mt-1 truncate font-mono text-xs text-foreground">
                    {card.equity}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/50 bg-background/30 p-3">
                  <p className="text-[10px] text-muted-foreground">P&L</p>
                  <p className="mt-1 truncate font-mono text-xs text-foreground">
                    {card.pnl}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-4">
            <div className="flex items-center gap-2">
              <AccountLogoFrame
                src={card.author.avatar}
                alt={`${card.author.name} logo`}
                className="size-8 border border-border/50 bg-background ring-2 ring-background"
                size={32}
              />
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-foreground">
                  {card.author.name}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {card.status} / {card.date}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-secondary/50 px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>{card.readTime}</span>
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
    );
  });

  if (cards.length === 0) {
    return (
      <section className="rounded-xl border border-border/70 bg-card/60 p-6 text-sm text-muted-foreground">
        No hay cuentas conectadas todavía. Cuando llegue un snapshot MT5, aparecerán aquí con broker,
        servidor, login y estado de conexión.
      </section>
    );
  }

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-5 overflow-hidden">
      <div className="group/slider relative min-w-0 max-w-full overflow-hidden p-0">
        <div className="absolute left-2 top-1/2 z-20 -translate-y-1/2 opacity-0 transition-opacity duration-300 group-hover/slider:opacity-100">
          <button
            onClick={() => scrollTo("left")}
            className="flex h-12 w-12 items-center justify-center rounded-full border border-border/50 bg-background/80 shadow-lg backdrop-blur-md transition-all hover:scale-110 hover:bg-background active:scale-95"
            aria-label="Ver cuentas anteriores"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        </div>
        <div className="absolute right-2 top-1/2 z-20 -translate-y-1/2 opacity-0 transition-opacity duration-300 group-hover/slider:opacity-100">
          <button
            onClick={() => scrollTo("right")}
            className="flex h-12 w-12 items-center justify-center rounded-full border border-border/50 bg-background/80 shadow-lg backdrop-blur-md transition-all hover:scale-110 hover:bg-background active:scale-95"
            aria-label="Ver cuentas siguientes"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </div>

        <motion.div
          ref={containerRef}
          className="max-w-full cursor-grab overflow-hidden px-1 py-8 active:cursor-grabbing"
          whileTap={{ cursor: "grabbing" }}
        >
          <motion.div
            drag="x"
            dragConstraints={{ right: 0, left: -width }}
            dragElastic={0.1}
            style={{ x }}
            className="flex gap-6"
          >
            {cardNodes}
          </motion.div>
        </motion.div>
      </div>

      {selectedAccount ? (
        <AccountConnectionDetail key={selectedAccount.id} account={selectedAccount} />
      ) : null}
    </div>
  );
}
