"use client";

import * as React from "react";
import {
  BookOpenCheck,
  CheckCircle2,
  Lightbulb,
  NotebookPen,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";
import { cn } from "@/lib/utils";

type NoteCategory = "trade" | "strategy" | "idea" | "review";
type NotesFilter = "all" | NoteCategory;

type TradeNote = {
  id: string;
  title: string;
  body: string;
  category: NoteCategory;
  symbol: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

type NoteDraft = {
  title: string;
  body: string;
  category: NoteCategory;
  symbol: string;
};

const NOTES_STORAGE_KEY = "kmfx-edge-notes-v1";

const noteCategories: Array<{
  value: NoteCategory;
  label: string;
  description: string;
}> = [
  {
    value: "trade",
    label: "Trade",
    description: "Entrada, salida, gestión o error puntual.",
  },
  {
    value: "strategy",
    label: "Estrategia",
    description: "Regla, setup, filtro o mejora del plan.",
  },
  {
    value: "idea",
    label: "Idea",
    description: "Observación, hipótesis o punto pendiente.",
  },
  {
    value: "review",
    label: "Review",
    description: "Lectura posterior y aprendizaje de sesión.",
  },
];

const emptyDraft: NoteDraft = {
  title: "",
  body: "",
  category: "trade",
  symbol: "",
};

const dateFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function PageMotion({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}

function createNoteId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `note-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function parseStoredNotes(value: string | null): TradeNote[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((note): note is TradeNote => {
      return (
        typeof note?.id === "string" &&
        typeof note.title === "string" &&
        typeof note.body === "string" &&
        noteCategories.some((category) => category.value === note.category) &&
        typeof note.symbol === "string" &&
        typeof note.pinned === "boolean" &&
        typeof note.createdAt === "string" &&
        typeof note.updatedAt === "string"
      );
    });
  } catch {
    return [];
  }
}

function formatNoteDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Sin fecha";

  return dateFormatter.format(date);
}

function getCategoryLabel(category: NoteCategory) {
  return noteCategories.find((item) => item.value === category)?.label ?? "Nota";
}

function getSymbols(workspace: WorkspaceState) {
  return [...new Set(workspace.trades.map((trade) => trade.symbol))]
    .filter(Boolean)
    .toSorted();
}

function matchesQuery(note: TradeNote, query: string) {
  if (!query) return true;

  return [
    note.title,
    note.body,
    note.symbol,
    getCategoryLabel(note.category),
  ]
    .join(" ")
    .toLocaleLowerCase("es-ES")
    .includes(query);
}

function buildNoteSearchText(query: string) {
  return query.trim().toLocaleLowerCase("es-ES");
}

function NotesStats({ notes }: { notes: TradeNote[] }) {
  const pinnedCount = notes.filter((note) => note.pinned).length;
  const tradeCount = notes.filter((note) => note.category === "trade").length;
  const strategyCount = notes.filter((note) => note.category === "strategy").length;

  return (
    <section className="grid gap-3 md:grid-cols-3">
      {[
        { label: "Apuntes", value: String(notes.length), detail: "Total local" },
        { label: "Fijados", value: String(pinnedCount), detail: "Prioridad visible" },
        {
          label: "Operativa",
          value: `${tradeCount}/${strategyCount}`,
          detail: "Trade y estrategia",
        },
      ].map((item) => (
        <Card key={item.label} size="sm" className="border-border/70 bg-card/70">
          <CardHeader>
            <CardDescription>{item.label}</CardDescription>
            <CardTitle className="text-2xl">{item.value}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{item.detail}</p>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

function NoteCategoryIcon({ category }: { category: NoteCategory }) {
  if (category === "strategy") return <BookOpenCheck className="size-4" aria-hidden="true" />;
  if (category === "idea") return <Lightbulb className="size-4" aria-hidden="true" />;
  if (category === "review") return <CheckCircle2 className="size-4" aria-hidden="true" />;

  return <NotebookPen className="size-4" aria-hidden="true" />;
}

export function NotesReferenceSection({
  workspace,
}: {
  workspace: WorkspaceState;
}) {
  const symbols = React.useMemo(() => getSymbols(workspace), [workspace]);
  const [hydrated, setHydrated] = React.useState(false);
  const [notes, setNotes] = React.useState<TradeNote[]>([]);
  const [draft, setDraft] = React.useState<NoteDraft>(emptyDraft);
  const [editingNoteId, setEditingNoteId] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<NotesFilter>("all");
  const normalizedQuery = buildNoteSearchText(query);
  const editingNote = notes.find((note) => note.id === editingNoteId) ?? null;
  const canSubmit = Boolean(draft.title.trim() || draft.body.trim());

  React.useEffect(() => {
    let mounted = true;

    queueMicrotask(() => {
      if (!mounted) return;

      setNotes(parseStoredNotes(window.localStorage.getItem(NOTES_STORAGE_KEY)));
      setHydrated(true);
    });

    return () => {
      mounted = false;
    };
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;

    window.localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
  }, [hydrated, notes]);

  const visibleNotes = React.useMemo(() => {
    return notes
      .filter((note) => filter === "all" || note.category === filter)
      .filter((note) => matchesQuery(note, normalizedQuery))
      .toSorted((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;

        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [filter, normalizedQuery, notes]);

  function resetDraft() {
    setDraft(emptyDraft);
    setEditingNoteId(null);
  }

  function submitNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) return;

    const now = new Date().toISOString();
    const nextDraft = {
      ...draft,
      title: draft.title.trim() || "Apunte sin título",
      body: draft.body.trim(),
      symbol: draft.symbol.trim().toUpperCase(),
    };

    setNotes((current) => {
      if (editingNoteId) {
        return current.map((note) =>
          note.id === editingNoteId
            ? {
                ...note,
                ...nextDraft,
                updatedAt: now,
              }
            : note,
        );
      }

      return [
        {
          id: createNoteId(),
          ...nextDraft,
          pinned: false,
          createdAt: now,
          updatedAt: now,
        },
        ...current,
      ];
    });
    resetDraft();
  }

  function editNote(note: TradeNote) {
    setEditingNoteId(note.id);
    setDraft({
      title: note.title,
      body: note.body,
      category: note.category,
      symbol: note.symbol,
    });
  }

  function deleteNote(noteId: string) {
    setNotes((current) => current.filter((note) => note.id !== noteId));
    if (editingNoteId === noteId) resetDraft();
  }

  function togglePinned(noteId: string) {
    const now = new Date().toISOString();

    setNotes((current) =>
      current.map((note) =>
        note.id === noteId
          ? { ...note, pinned: !note.pinned, updatedAt: now }
          : note,
      ),
    );
  }

  return (
    <PageMotion>
      <div className="grid gap-4">
        <Card size="sm" className="border-border/70 bg-card/70 shadow-sm">
          <CardHeader className="gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
            <div className="min-w-0">
              <CardTitle className="text-xl">Apuntes</CardTitle>
              <CardDescription className="mt-1">
                Notas de trades, estrategia, ideas y revisiones guardadas en este navegador.
              </CardDescription>
            </div>
            <CardAction>
              <Badge variant="outline">Local</Badge>
            </CardAction>
          </CardHeader>
        </Card>

        <NotesStats notes={notes} />

        <div className="grid gap-4 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
          <Card className="border-border/70 bg-card/70">
            <CardHeader>
              <CardTitle>{editingNote ? "Editar apunte" : "Nuevo apunte"}</CardTitle>
              <CardDescription>
                Captura contexto operativo antes de que se pierda.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="flex flex-col gap-5" onSubmit={submitNote}>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="note-title">Título</FieldLabel>
                    <Input
                      id="note-title"
                      value={draft.title}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                      placeholder="Ej. Reentrada tras noticia"
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Tipo</FieldLabel>
                    <ToggleGroup
                      aria-label="Tipo de apunte"
                      className="flex-wrap"
                      onValueChange={(value) => {
                        const nextCategory = value[0] as NoteCategory | undefined;
                        if (nextCategory) {
                          setDraft((current) => ({
                            ...current,
                            category: nextCategory,
                          }));
                        }
                      }}
                      size="sm"
                      spacing={1}
                      value={[draft.category]}
                      variant="outline"
                    >
                      {noteCategories.map((category) => (
                        <ToggleGroupItem
                          className="h-10 min-w-20 sm:h-8"
                          key={category.value}
                          value={category.value}
                        >
                          {category.label}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                    <FieldDescription>
                      {noteCategories.find((item) => item.value === draft.category)?.description}
                    </FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="note-symbol">Símbolo</FieldLabel>
                    <Input
                      id="note-symbol"
                      list="note-symbols"
                      value={draft.symbol}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          symbol: event.target.value,
                        }))
                      }
                      placeholder="Opcional"
                    />
                    <datalist id="note-symbols">
                      {symbols.map((symbol) => (
                        <option key={symbol} value={symbol} />
                      ))}
                    </datalist>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="note-body">Nota</FieldLabel>
                    <Textarea
                      id="note-body"
                      value={draft.body}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          body: event.target.value,
                        }))
                      }
                      placeholder="Qué pasó, qué viste y qué decisión tomarás después."
                      className="min-h-44 resize-y"
                    />
                  </Field>
                </FieldGroup>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button type="submit" disabled={!canSubmit}>
                    {editingNote ? (
                      <Save data-icon="inline-start" />
                    ) : (
                      <Plus data-icon="inline-start" />
                    )}
                    {editingNote ? "Guardar cambios" : "Añadir apunte"}
                  </Button>
                  {editingNote ? (
                    <Button type="button" variant="outline" onClick={resetDraft}>
                      <X data-icon="inline-start" />
                      Cancelar
                    </Button>
                  ) : null}
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/70">
            <CardHeader className="gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,360px)] lg:items-start">
              <div className="min-w-0">
                <CardTitle>Lista de apuntes</CardTitle>
                <CardDescription>
                  {visibleNotes.length} visibles de {notes.length} guardados.
                </CardDescription>
              </div>
              <CardAction className="col-start-1 row-start-2 w-full lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:w-[340px]">
                <div className="relative h-10">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Buscar apunte"
                    className="h-10 pl-9"
                    aria-label="Buscar apuntes"
                  />
                </div>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ToggleGroup
                aria-label="Filtrar apuntes"
                className="flex-wrap"
                onValueChange={(value) => {
                  const nextFilter = value[0] as NotesFilter | undefined;
                  if (nextFilter) setFilter(nextFilter);
                }}
                size="sm"
                spacing={1}
                value={[filter]}
                variant="outline"
              >
                <ToggleGroupItem className="h-10 min-w-16 sm:h-8" value="all">
                  Todos
                </ToggleGroupItem>
                {noteCategories.map((category) => (
                  <ToggleGroupItem
                    className="h-10 min-w-20 sm:h-8"
                    key={category.value}
                    value={category.value}
                  >
                    {category.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>

              {visibleNotes.length ? (
                <div className="grid gap-3">
                  {visibleNotes.map((note) => (
                    <article
                      key={note.id}
                      className={cn(
                        "rounded-lg border border-border/70 bg-background/28 p-4 shadow-sm",
                        note.pinned && "bg-background/45",
                      )}
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={note.pinned ? "secondary" : "outline"}>
                              <NoteCategoryIcon category={note.category} />
                              {getCategoryLabel(note.category)}
                            </Badge>
                            {note.symbol ? (
                              <Badge variant="outline">{note.symbol}</Badge>
                            ) : null}
                            <span className="text-xs text-muted-foreground">
                              {formatNoteDate(note.updatedAt)}
                            </span>
                          </div>
                          <h2 className="mt-3 text-base font-semibold text-foreground">
                            {note.title}
                          </h2>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={note.pinned ? "Soltar apunte" : "Fijar apunte"}
                            onClick={() => togglePinned(note.id)}
                          >
                            {note.pinned ? (
                              <PinOff data-icon="inline-start" />
                            ) : (
                              <Pin data-icon="inline-start" />
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Editar apunte"
                            onClick={() => editNote(note)}
                          >
                            <Pencil data-icon="inline-start" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Eliminar apunte"
                            onClick={() => deleteNote(note.id)}
                          >
                            <Trash2 data-icon="inline-start" />
                          </Button>
                        </div>
                      </div>
                      {note.body ? (
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                          {note.body}
                        </p>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-border/70 bg-background/25 p-6 text-sm text-muted-foreground">
                  No hay apuntes para ese filtro.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageMotion>
  );
}
