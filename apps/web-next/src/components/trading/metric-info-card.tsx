"use client";

import * as React from "react";
import Link from "next/link";
import { m as motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, Plus, X } from "lucide-react";

import type { StudyGlossaryRow } from "@/lib/domain/study-selectors";
import { cn } from "@/lib/utils";

type MetricInfoCardProps = {
  item: StudyGlossaryRow;
};

const morphEase = [0.22, 1, 0.36, 1] as const;

const cardTones: Record<
  string,
  {
    value: string;
    plus: string;
  }
> = {
  pnl: {
    value: "border-sky-200/20 bg-sky-300/12 text-sky-50",
    plus: "border-sky-200/20 bg-sky-300/10 text-sky-50",
  },
  "profit-factor": {
    value: "border-emerald-200/20 bg-emerald-300/12 text-emerald-50",
    plus: "border-emerald-200/20 bg-emerald-300/10 text-emerald-50",
  },
  "win-rate": {
    value: "border-violet-200/20 bg-violet-300/12 text-violet-50",
    plus: "border-violet-200/20 bg-violet-300/10 text-violet-50",
  },
  expectancy: {
    value: "border-amber-200/20 bg-amber-300/12 text-amber-50",
    plus: "border-amber-200/20 bg-amber-300/10 text-amber-50",
  },
  drawdown: {
    value: "border-rose-200/20 bg-rose-300/12 text-rose-50",
    plus: "border-rose-200/20 bg-rose-300/10 text-rose-50",
  },
  score: {
    value: "border-cyan-200/20 bg-cyan-300/12 text-cyan-50",
    plus: "border-cyan-200/20 bg-cyan-300/10 text-cyan-50",
  },
};

const categoryTones: Record<StudyGlossaryRow["category"], (typeof cardTones)[string]> = {
  Métricas: {
    value: "border-zinc-100/20 bg-zinc-950/45 text-zinc-50",
    plus: "border-zinc-100/20 bg-zinc-950/35 text-zinc-100",
  },
  Riesgo: {
    value: "border-red-200/20 bg-red-300/10 text-red-50",
    plus: "border-red-200/20 bg-red-300/10 text-red-50",
  },
  Operativa: {
    value: "border-lime-200/20 bg-lime-300/10 text-lime-50",
    plus: "border-lime-200/20 bg-lime-300/10 text-lime-50",
  },
  "Prop Firms": {
    value: "border-orange-200/20 bg-orange-300/10 text-orange-50",
    plus: "border-orange-200/20 bg-orange-300/10 text-orange-50",
  },
  Calculadora: {
    value: "border-blue-200/20 bg-blue-300/10 text-blue-50",
    plus: "border-blue-200/20 bg-blue-300/10 text-blue-50",
  },
};

type AbstractCardBackground = {
  base: string;
  wave: string;
  glow: string;
  light: string;
  waveStyle: React.CSSProperties;
  glowStyle: React.CSSProperties;
};

const abstractBackgrounds: Record<string, AbstractCardBackground> = {
  pnl: {
    base: "linear-gradient(135deg,#0cc8e8 0%,#26d7f6 27%,#8a22dd 58%,#f4b282 100%)",
    wave: "linear-gradient(105deg,rgba(255,213,173,.9),rgba(226,93,226,.74),rgba(70,17,168,.88))",
    glow: "radial-gradient(circle,rgba(255,244,220,.72),rgba(255,244,220,0) 62%)",
    light: "linear-gradient(115deg,rgba(255,255,255,.26),rgba(255,255,255,0) 44%)",
    waveStyle: { left: "-18%", top: "38%", width: "136%", height: "54%", transform: "rotate(13deg)", borderRadius: "42% 58% 48% 52%" },
    glowStyle: { left: "-16%", top: "8%", width: "72%", height: "68%" },
  },
  "profit-factor": {
    base: "linear-gradient(135deg,#3124e9 0%,#6949f5 38%,#9a4df6 70%,#60d7de 100%)",
    wave: "linear-gradient(128deg,rgba(100,58,247,.92),rgba(155,88,255,.82),rgba(216,245,255,.74))",
    glow: "radial-gradient(circle,rgba(160,240,255,.54),rgba(160,240,255,0) 64%)",
    light: "linear-gradient(132deg,rgba(255,255,255,.22),rgba(255,255,255,0) 38%)",
    waveStyle: { right: "-24%", top: "-8%", width: "122%", height: "100%", transform: "rotate(-24deg)", borderRadius: "56% 44% 58% 42%" },
    glowStyle: { right: "-12%", top: "10%", width: "58%", height: "72%" },
  },
  "win-rate": {
    base: "linear-gradient(140deg,#0814a7 0%,#2b63ff 31%,#b736f2 67%,#f186bc 100%)",
    wave: "linear-gradient(102deg,rgba(23,211,244,.78),rgba(102,38,231,.72),rgba(255,174,220,.7))",
    glow: "radial-gradient(circle,rgba(255,236,255,.58),rgba(255,236,255,0) 60%)",
    light: "linear-gradient(72deg,rgba(255,255,255,.18),rgba(255,255,255,0) 50%)",
    waveStyle: { left: "-26%", bottom: "-20%", width: "142%", height: "62%", transform: "rotate(-10deg)", borderRadius: "62% 38% 52% 48%" },
    glowStyle: { left: "30%", top: "2%", width: "62%", height: "74%" },
  },
  expectancy: {
    base: "linear-gradient(135deg,#ff8d4e 0%,#f8d28a 28%,#c449e8 64%,#3600b5 100%)",
    wave: "linear-gradient(118deg,rgba(0,207,222,.82),rgba(150,45,223,.86),rgba(54,0,152,.9))",
    glow: "radial-gradient(circle,rgba(255,246,197,.62),rgba(255,246,197,0) 65%)",
    light: "linear-gradient(100deg,rgba(255,255,255,.28),rgba(255,255,255,0) 40%)",
    waveStyle: { left: "-12%", bottom: "-26%", width: "126%", height: "68%", transform: "rotate(18deg)", borderRadius: "46% 54% 60% 40%" },
    glowStyle: { left: "-18%", top: "-10%", width: "68%", height: "82%" },
  },
  drawdown: {
    base: "linear-gradient(130deg,#4410b5 0%,#e03bc3 36%,#ff8260 68%,#ffe0b2 100%)",
    wave: "linear-gradient(115deg,rgba(76,16,181,.9),rgba(227,54,188,.78),rgba(255,229,198,.68))",
    glow: "radial-gradient(circle,rgba(255,206,184,.58),rgba(255,206,184,0) 64%)",
    light: "linear-gradient(78deg,rgba(255,255,255,.2),rgba(255,255,255,0) 46%)",
    waveStyle: { right: "-18%", top: "42%", width: "134%", height: "58%", transform: "rotate(-15deg)", borderRadius: "54% 46% 40% 60%" },
    glowStyle: { right: "8%", top: "-18%", width: "64%", height: "82%" },
  },
  score: {
    base: "linear-gradient(145deg,#00c7dd 0%,#21a7ff 30%,#7654ff 60%,#fb91de 100%)",
    wave: "linear-gradient(112deg,rgba(255,247,210,.78),rgba(136,70,244,.82),rgba(0,137,220,.76))",
    glow: "radial-gradient(circle,rgba(191,255,246,.6),rgba(191,255,246,0) 62%)",
    light: "linear-gradient(120deg,rgba(255,255,255,.22),rgba(255,255,255,0) 42%)",
    waveStyle: { left: "-22%", top: "18%", width: "128%", height: "52%", transform: "rotate(10deg)", borderRadius: "58% 42% 52% 48%" },
    glowStyle: { left: "8%", bottom: "-20%", width: "70%", height: "82%" },
  },
  "daily-room": {
    base: "linear-gradient(135deg,#230082 0%,#6a1fd3 31%,#00bcd9 67%,#c5fff3 100%)",
    wave: "linear-gradient(122deg,rgba(24,211,226,.86),rgba(111,35,217,.76),rgba(24,0,98,.9))",
    glow: "radial-gradient(circle,rgba(202,255,241,.56),rgba(202,255,241,0) 63%)",
    light: "linear-gradient(92deg,rgba(255,255,255,.18),rgba(255,255,255,0) 47%)",
    waveStyle: { right: "-30%", bottom: "-18%", width: "146%", height: "62%", transform: "rotate(23deg)", borderRadius: "50% 50% 42% 58%" },
    glowStyle: { right: "-14%", top: "12%", width: "76%", height: "70%" },
  },
  "open-risk": {
    base: "linear-gradient(145deg,#ff4f8e 0%,#ff9b58 26%,#8c32e7 60%,#1517b8 100%)",
    wave: "linear-gradient(118deg,rgba(255,222,173,.82),rgba(255,76,154,.72),rgba(58,24,172,.88))",
    glow: "radial-gradient(circle,rgba(255,205,232,.6),rgba(255,205,232,0) 62%)",
    light: "linear-gradient(108deg,rgba(255,255,255,.23),rgba(255,255,255,0) 41%)",
    waveStyle: { left: "-24%", top: "48%", width: "142%", height: "56%", transform: "rotate(-9deg)", borderRadius: "48% 52% 57% 43%" },
    glowStyle: { left: "-12%", top: "-18%", width: "62%", height: "80%" },
  },
  lotaje: {
    base: "linear-gradient(135deg,#009fd6 0%,#14e2c8 33%,#7a31ed 67%,#f6a7ff 100%)",
    wave: "linear-gradient(106deg,rgba(246,251,255,.72),rgba(71,216,218,.82),rgba(107,40,226,.82))",
    glow: "radial-gradient(circle,rgba(215,255,247,.58),rgba(215,255,247,0) 66%)",
    light: "linear-gradient(70deg,rgba(255,255,255,.21),rgba(255,255,255,0) 43%)",
    waveStyle: { right: "-22%", top: "28%", width: "132%", height: "58%", transform: "rotate(16deg)", borderRadius: "60% 40% 48% 52%" },
    glowStyle: { left: "18%", top: "-16%", width: "68%", height: "78%" },
  },
  "risk-dd": {
    base: "linear-gradient(125deg,#20035f 0%,#7c26d6 35%,#ff618d 70%,#ffc28a 100%)",
    wave: "linear-gradient(126deg,rgba(255,197,149,.76),rgba(244,82,144,.76),rgba(79,18,177,.9))",
    glow: "radial-gradient(circle,rgba(255,216,191,.54),rgba(255,216,191,0) 64%)",
    light: "linear-gradient(118deg,rgba(255,255,255,.19),rgba(255,255,255,0) 44%)",
    waveStyle: { left: "-30%", bottom: "-14%", width: "148%", height: "60%", transform: "rotate(-18deg)", borderRadius: "45% 55% 48% 52%" },
    glowStyle: { right: "-8%", top: "-20%", width: "70%", height: "84%" },
  },
  sessions: {
    base: "linear-gradient(140deg,#0420c2 0%,#5141f2 34%,#b55af5 64%,#f1c4ff 100%)",
    wave: "linear-gradient(112deg,rgba(93,236,255,.72),rgba(94,72,242,.84),rgba(226,178,255,.66))",
    glow: "radial-gradient(circle,rgba(230,210,255,.58),rgba(230,210,255,0) 63%)",
    light: "linear-gradient(98deg,rgba(255,255,255,.2),rgba(255,255,255,0) 40%)",
    waveStyle: { left: "-18%", top: "36%", width: "130%", height: "54%", transform: "rotate(7deg)", borderRadius: "56% 44% 62% 38%" },
    glowStyle: { left: "-10%", top: "-12%", width: "66%", height: "76%" },
  },
  symbols: {
    base: "linear-gradient(135deg,#0088ff 0%,#00d2c5 31%,#9a3be7 67%,#24118f 100%)",
    wave: "linear-gradient(118deg,rgba(255,236,190,.74),rgba(0,199,217,.78),rgba(107,29,205,.88))",
    glow: "radial-gradient(circle,rgba(189,255,247,.56),rgba(189,255,247,0) 62%)",
    light: "linear-gradient(130deg,rgba(255,255,255,.24),rgba(255,255,255,0) 45%)",
    waveStyle: { right: "-26%", top: "-14%", width: "132%", height: "88%", transform: "rotate(-22deg)", borderRadius: "40% 60% 54% 46%" },
    glowStyle: { left: "-14%", bottom: "-24%", width: "72%", height: "88%" },
  },
  setups: {
    base: "linear-gradient(145deg,#ffcf82 0%,#f05bd0 33%,#7637f1 66%,#1027c6 100%)",
    wave: "linear-gradient(110deg,rgba(16,194,232,.82),rgba(143,50,230,.78),rgba(255,214,162,.7))",
    glow: "radial-gradient(circle,rgba(255,225,184,.58),rgba(255,225,184,0) 62%)",
    light: "linear-gradient(82deg,rgba(255,255,255,.22),rgba(255,255,255,0) 46%)",
    waveStyle: { left: "-24%", bottom: "-22%", width: "138%", height: "64%", transform: "rotate(12deg)", borderRadius: "62% 38% 46% 54%" },
    glowStyle: { right: "-10%", top: "-16%", width: "62%", height: "76%" },
  },
  partials: {
    base: "linear-gradient(132deg,#2800a5 0%,#3b65ff 28%,#d746f2 63%,#ffdfb8 100%)",
    wave: "linear-gradient(130deg,rgba(255,238,209,.76),rgba(189,71,239,.78),rgba(48,26,198,.88))",
    glow: "radial-gradient(circle,rgba(226,214,255,.58),rgba(226,214,255,0) 65%)",
    light: "linear-gradient(106deg,rgba(255,255,255,.22),rgba(255,255,255,0) 42%)",
    waveStyle: { right: "-24%", top: "44%", width: "140%", height: "58%", transform: "rotate(-13deg)", borderRadius: "48% 52% 44% 56%" },
    glowStyle: { left: "12%", top: "-20%", width: "70%", height: "84%" },
  },
  "prop-daily-room": {
    base: "linear-gradient(138deg,#0d096d 0%,#6832ee 30%,#ff6dab 66%,#ffc77c 100%)",
    wave: "linear-gradient(112deg,rgba(31,212,235,.72),rgba(105,56,238,.82),rgba(255,199,124,.72))",
    glow: "radial-gradient(circle,rgba(255,224,184,.56),rgba(255,224,184,0) 64%)",
    light: "linear-gradient(116deg,rgba(255,255,255,.21),rgba(255,255,255,0) 43%)",
    waveStyle: { left: "-28%", top: "16%", width: "144%", height: "58%", transform: "rotate(20deg)", borderRadius: "56% 44% 48% 52%" },
    glowStyle: { right: "-8%", bottom: "-22%", width: "72%", height: "86%" },
  },
  "prop-total-limit": {
    base: "linear-gradient(128deg,#00b6d6 0%,#7654ff 36%,#c336e6 68%,#ffb28b 100%)",
    wave: "linear-gradient(120deg,rgba(255,244,211,.75),rgba(39,202,223,.78),rgba(111,47,225,.88))",
    glow: "radial-gradient(circle,rgba(192,250,255,.58),rgba(192,250,255,0) 62%)",
    light: "linear-gradient(88deg,rgba(255,255,255,.2),rgba(255,255,255,0) 48%)",
    waveStyle: { right: "-20%", bottom: "-20%", width: "132%", height: "62%", transform: "rotate(-19deg)", borderRadius: "50% 50% 60% 40%" },
    glowStyle: { left: "-16%", top: "-12%", width: "68%", height: "80%" },
  },
  consistency: {
    base: "linear-gradient(142deg,#2b1de0 0%,#7d40f2 32%,#ed55d5 64%,#ffe3a8 100%)",
    wave: "linear-gradient(104deg,rgba(26,225,232,.72),rgba(138,57,238,.82),rgba(255,226,176,.74))",
    glow: "radial-gradient(circle,rgba(245,223,255,.6),rgba(245,223,255,0) 66%)",
    light: "linear-gradient(122deg,rgba(255,255,255,.24),rgba(255,255,255,0) 44%)",
    waveStyle: { left: "-20%", top: "50%", width: "136%", height: "56%", transform: "rotate(8deg)", borderRadius: "44% 56% 48% 52%" },
    glowStyle: { right: "2%", top: "-20%", width: "72%", height: "82%" },
  },
  payout: {
    base: "linear-gradient(136deg,#0610a8 0%,#693bff 33%,#00c2e8 62%,#eaffff 100%)",
    wave: "linear-gradient(126deg,rgba(255,232,198,.72),rgba(78,220,239,.78),rgba(79,41,217,.88))",
    glow: "radial-gradient(circle,rgba(220,255,255,.58),rgba(220,255,255,0) 64%)",
    light: "linear-gradient(74deg,rgba(255,255,255,.2),rgba(255,255,255,0) 46%)",
    waveStyle: { right: "-34%", top: "18%", width: "148%", height: "62%", transform: "rotate(-25deg)", borderRadius: "58% 42% 52% 48%" },
    glowStyle: { left: "-8%", bottom: "-22%", width: "70%", height: "84%" },
  },
  pips: {
    base: "linear-gradient(130deg,#16c6ef 0%,#bd4ce9 35%,#5727d9 68%,#1a0987 100%)",
    wave: "linear-gradient(114deg,rgba(255,211,171,.78),rgba(186,70,231,.82),rgba(23,198,232,.72))",
    glow: "radial-gradient(circle,rgba(220,244,255,.56),rgba(220,244,255,0) 62%)",
    light: "linear-gradient(104deg,rgba(255,255,255,.2),rgba(255,255,255,0) 42%)",
    waveStyle: { left: "-24%", bottom: "-18%", width: "140%", height: "60%", transform: "rotate(17deg)", borderRadius: "52% 48% 60% 40%" },
    glowStyle: { right: "-12%", top: "-18%", width: "66%", height: "82%" },
  },
  "pip-value": {
    base: "linear-gradient(138deg,#ff9e72 0%,#f0d2b1 26%,#b342ef 60%,#3420d8 100%)",
    wave: "linear-gradient(122deg,rgba(0,196,221,.82),rgba(180,68,234,.74),rgba(255,229,196,.72))",
    glow: "radial-gradient(circle,rgba(255,238,215,.6),rgba(255,238,215,0) 62%)",
    light: "linear-gradient(96deg,rgba(255,255,255,.24),rgba(255,255,255,0) 42%)",
    waveStyle: { right: "-22%", top: "42%", width: "134%", height: "56%", transform: "rotate(-8deg)", borderRadius: "46% 54% 42% 58%" },
    glowStyle: { left: "-18%", top: "-14%", width: "70%", height: "82%" },
  },
  "calculator-lotage": {
    base: "linear-gradient(144deg,#03c1d9 0%,#42f0d2 28%,#8535ed 65%,#f6b4ff 100%)",
    wave: "linear-gradient(108deg,rgba(255,236,199,.76),rgba(55,225,221,.8),rgba(111,47,230,.86))",
    glow: "radial-gradient(circle,rgba(207,255,244,.58),rgba(207,255,244,0) 64%)",
    light: "linear-gradient(118deg,rgba(255,255,255,.23),rgba(255,255,255,0) 44%)",
    waveStyle: { left: "-26%", top: "34%", width: "146%", height: "60%", transform: "rotate(-14deg)", borderRadius: "60% 40% 50% 50%" },
    glowStyle: { right: "-8%", bottom: "-20%", width: "74%", height: "84%" },
  },
  currency: {
    base: "linear-gradient(126deg,#1728d8 0%,#5d3df4 30%,#dd47ec 66%,#ffd5a5 100%)",
    wave: "linear-gradient(118deg,rgba(0,208,226,.74),rgba(113,58,240,.84),rgba(255,214,166,.74))",
    glow: "radial-gradient(circle,rgba(239,220,255,.58),rgba(239,220,255,0) 65%)",
    light: "linear-gradient(86deg,rgba(255,255,255,.22),rgba(255,255,255,0) 46%)",
    waveStyle: { right: "-28%", bottom: "-20%", width: "144%", height: "64%", transform: "rotate(21deg)", borderRadius: "48% 52% 58% 42%" },
    glowStyle: { left: "-14%", top: "-18%", width: "70%", height: "84%" },
  },
};

function getFallbackBackground(id: string): AbstractCardBackground {
  const hue = [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;

  return {
    base: `linear-gradient(135deg,hsl(${hue} 88% 52%) 0%,hsl(${(hue + 38) % 360} 92% 58%) 32%,hsl(${(hue + 96) % 360} 84% 54%) 68%,hsl(${(hue + 150) % 360} 90% 72%) 100%)`,
    wave: `linear-gradient(118deg,hsla(${(hue + 168) % 360},92%,68%,.78),hsla(${(hue + 48) % 360},84%,58%,.8),hsla(${hue},88%,42%,.86))`,
    glow: `radial-gradient(circle,hsla(${(hue + 22) % 360},100%,86%,.58),hsla(${(hue + 22) % 360},100%,86%,0) 64%)`,
    light: "linear-gradient(104deg,rgba(255,255,255,.22),rgba(255,255,255,0) 44%)",
    waveStyle: { left: "-20%", top: "38%", width: "136%", height: "58%", transform: `rotate(${(hue % 32) - 16}deg)`, borderRadius: "54% 46% 48% 52%" },
    glowStyle: { right: "-10%", top: "-18%", width: "70%", height: "84%" },
  };
}

function AbstractMetricVisual({
  visual,
  className,
  children,
}: {
  visual: AbstractCardBackground;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("relative overflow-hidden bg-background", className)}>
      <span className="absolute inset-0" style={{ background: visual.base }} />
      <span
        className="absolute opacity-90 blur-[1px]"
        style={{ background: visual.wave, ...visual.waveStyle }}
      />
      <span
        className="absolute opacity-80 blur-2xl"
        style={{ background: visual.glow, ...visual.glowStyle }}
      />
      <span
        className="absolute inset-0 opacity-80 mix-blend-soft-light"
        style={{ background: visual.light }}
      />
      <span className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.10),transparent_44%,rgba(0,0,0,0.18))]" />
      <span className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/45 to-transparent" />
      {children}
    </div>
  );
}

export function MetricInfoCard({ item }: MetricInfoCardProps) {
  const [open, setOpen] = React.useState(false);
  const reducedMotion = useReducedMotion();
  const titleId = React.useId();
  const descriptionId = React.useId();
  const layoutId = `metric-info-${item.id}`;
  const transition = reducedMotion
    ? { duration: 0 }
    : { duration: 0.24, ease: morphEase, type: "tween" as const };
  const tone = cardTones[item.id] ?? categoryTones[item.category];
  const visual = abstractBackgrounds[item.id] ?? getFallbackBackground(item.id);

  React.useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <>
      <motion.button
        type="button"
        layoutId={layoutId}
        transition={transition}
        whileHover={reducedMotion ? undefined : { y: -2 }}
        whileTap={reducedMotion ? undefined : { scale: 0.995 }}
        onClick={() => setOpen(true)}
        className="group flex w-full max-w-[270px] flex-col overflow-hidden rounded-xl border border-border/70 bg-card/65 text-left outline-none transition-colors hover:border-foreground/20 hover:bg-card/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label={`Abrir detalle de ${item.term} en ${item.category}`}
      >
        <AbstractMetricVisual visual={visual} className="h-36 w-full">
          <span
            className={cn(
              "absolute right-2 top-2 rounded-md border px-2 py-1 font-mono text-xs backdrop-blur",
              tone.value,
            )}
          >
            {item.currentValue}
          </span>
        </AbstractMetricVisual>
        <div className="flex grow flex-row items-end justify-between gap-3 p-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
              {item.category}
            </p>
            <h2 className="mt-1 truncate text-base font-semibold tracking-normal text-foreground">
              {item.term}
            </h2>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {item.formula ? "Fórmula y datos" : "Contexto operativo"}
            </p>
          </div>
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full border transition-colors group-hover:text-foreground",
              tone.plus,
            )}
          >
            <Plus className="size-4" aria-hidden="true" />
          </span>
        </div>
      </motion.button>

      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={transition}
        >
          <motion.button
            type="button"
            className="absolute inset-0 cursor-default bg-background/82 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-label="Cerrar detalle"
          />
          <motion.article
            layoutId={layoutId}
            transition={transition}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            className={cn(
              "relative max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border/80 bg-card shadow-2xl outline-none",
            )}
          >
              <AbstractMetricVisual
                visual={visual}
                className="h-52 rounded-t-xl sm:h-64"
              />
              <div className="p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
                    {item.category}
                  </p>
                  <h2
                    id={titleId}
                    className="mt-2 text-2xl font-semibold tracking-normal text-foreground"
                  >
                    {item.term}
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-md border border-border/70 bg-background/45 px-2 py-1 font-mono text-sm text-foreground">
                    {item.currentValue}
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="flex size-9 items-center justify-center rounded-md border border-border/70 bg-background/45 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Cerrar"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <p
                id={descriptionId}
                className="mt-5 text-sm leading-6 text-muted-foreground"
              >
                {item.definition}
              </p>
              <div className="mt-5 grid gap-4">
                {item.formula ? (
                  <section>
                    <p className="text-xs text-muted-foreground">Fórmula</p>
                    <p className="mt-1 rounded-md border border-border/70 bg-background/35 p-3 font-mono text-xs leading-5 text-foreground">
                      {item.formula}
                    </p>
                  </section>
                ) : null}
                <section className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-md border border-border/70 bg-background/30 p-3">
                    <p className="text-xs text-muted-foreground">Datos necesarios</p>
                    <p className="mt-2 text-sm leading-6 text-foreground">
                      {item.dataNeeds}
                    </p>
                  </div>
                  <div className="rounded-md border border-border/70 bg-background/30 p-3">
                    <p className="text-xs text-muted-foreground">
                      Aviso de interpretación
                    </p>
                    <p className="mt-2 text-sm leading-6 text-foreground">
                      {item.interpretation}
                    </p>
                  </div>
                </section>
              </div>
              <div className="mt-5 flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Dónde verlo</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {item.usedIn.map((link) => (
                      <Link
                        key={`${item.id}-${link.href}`}
                        href={link.href}
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-border/70 bg-background/35 px-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.label}
                        <ArrowUpRight className="size-3" aria-hidden="true" />
                      </Link>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Fuente: {item.sourceLabel}
                </p>
              </div>
              </div>
          </motion.article>
        </motion.div>
      ) : null}
    </>
  );
}
