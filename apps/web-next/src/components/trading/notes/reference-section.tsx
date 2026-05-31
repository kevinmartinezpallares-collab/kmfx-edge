"use client";

import Image from "next/image";
import * as React from "react";
import {
  BookOpenCheck,
  CheckCircle2,
  ImageIcon,
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { WorkspaceState } from "@/lib/contracts/workspace-state";
import { cn } from "@/lib/utils";

type NoteCategory = "trade" | "strategy" | "idea" | "review";
type NotesFilter = "all" | NoteCategory;
type DraftTextField = "title" | "body" | "symbol";

type NoteImage = {
  id: string;
  name: string;
  dataUrl: string;
  mimeType: string;
  size: number;
};

type TradeNote = {
  id: string;
  title: string;
  body: string;
  category: NoteCategory;
  symbol: string;
  images: NoteImage[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

type NoteDraft = {
  title: string;
  body: string;
  category: NoteCategory;
  symbol: string;
  images: NoteImage[];
};

type NotesUiState = {
  notes: TradeNote[];
  draft: NoteDraft;
  editingNoteId: string | null;
  query: string;
  filter: NotesFilter;
  imageError: string;
};

type NotesUiAction =
  | { type: "notesLoaded"; notes: TradeNote[] }
  | { type: "draftFieldChanged"; field: DraftTextField; value: string }
  | { type: "draftCategoryChanged"; category: NoteCategory }
  | { type: "draftImagesAdded"; images: NoteImage[] }
  | { type: "draftImageRemoved"; imageId: string }
  | { type: "imageErrorChanged"; imageError: string }
  | { type: "noteSubmitted"; note: TradeNote; editingNoteId: string | null }
  | { type: "noteEdited"; note: TradeNote }
  | { type: "noteDeleted"; noteId: string }
  | { type: "notePinnedToggled"; noteId: string; updatedAt: string }
  | { type: "draftReset" }
  | { type: "queryChanged"; query: string }
  | { type: "filterChanged"; filter: NotesFilter };

const NOTES_STORAGE_KEY = "kmfx-edge-notes-v1";
const MAX_NOTE_IMAGES = 3;
const MAX_NOTE_IMAGE_BYTES = 1_000_000;

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

const dateFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function PageMotion({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}

function createEmptyDraft(): NoteDraft {
  return {
    title: "",
    body: "",
    category: "trade",
    symbol: "",
    images: [],
  };
}

const initialNotesUiState: NotesUiState = {
  notes: [],
  draft: createEmptyDraft(),
  editingNoteId: null,
  query: "",
  filter: "all",
  imageError: "",
};

function createNoteId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `note-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isNoteCategory(value: unknown): value is NoteCategory {
  return noteCategories.some((category) => category.value === value);
}

function normalizeStoredImages(value: unknown): NoteImage[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((image): image is NoteImage => {
      return (
        typeof image?.id === "string" &&
        typeof image.name === "string" &&
        typeof image.dataUrl === "string" &&
        image.dataUrl.startsWith("data:image/") &&
        typeof image.mimeType === "string" &&
        image.mimeType.startsWith("image/") &&
        typeof image.size === "number"
      );
    })
    .slice(0, MAX_NOTE_IMAGES);
}

function parseStoredNotes(value: string | null): TradeNote[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    return parsed.reduce<TradeNote[]>((notes, note) => {
      if (
        typeof note?.id !== "string" ||
        typeof note.title !== "string" ||
        typeof note.body !== "string" ||
        !isNoteCategory(note.category) ||
        typeof note.symbol !== "string" ||
        typeof note.pinned !== "boolean" ||
        typeof note.createdAt !== "string" ||
        typeof note.updatedAt !== "string"
      ) {
        return notes;
      }

      notes.push({
        id: note.id,
        title: note.title,
        body: note.body,
        category: note.category,
        symbol: note.symbol,
        images: normalizeStoredImages(note.images),
        pinned: note.pinned,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
      });

      return notes;
    }, []);
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
    ...(note.images ?? []).map((image) => image.name),
  ]
    .join(" ")
    .toLocaleLowerCase("es-ES")
    .includes(query);
}

function buildNoteSearchText(query: string) {
  return query.trim().toLocaleLowerCase("es-ES");
}

function readImageFile(file: File): Promise<NoteImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") {
        reject(new Error("No se pudo leer la imagen."));
        return;
      }

      resolve({
        id: createNoteId(),
        name: file.name,
        dataUrl: reader.result,
        mimeType: file.type,
        size: file.size,
      });
    });

    reader.addEventListener("error", () => {
      reject(new Error("No se pudo leer la imagen."));
    });

    reader.readAsDataURL(file);
  });
}

function notesUiReducer(state: NotesUiState, action: NotesUiAction): NotesUiState {
  switch (action.type) {
    case "notesLoaded":
      return { ...state, notes: action.notes };
    case "draftFieldChanged":
      return {
        ...state,
        draft: { ...state.draft, [action.field]: action.value },
      };
    case "draftCategoryChanged":
      return {
        ...state,
        draft: { ...state.draft, category: action.category },
      };
    case "draftImagesAdded":
      return {
        ...state,
        draft: {
          ...state.draft,
          images: [...state.draft.images, ...action.images].slice(0, MAX_NOTE_IMAGES),
        },
      };
    case "draftImageRemoved":
      return {
        ...state,
        draft: {
          ...state.draft,
          images: state.draft.images.filter((image) => image.id !== action.imageId),
        },
        imageError: "",
      };
    case "imageErrorChanged":
      return { ...state, imageError: action.imageError };
    case "noteSubmitted":
      return {
        ...state,
        notes: action.editingNoteId
          ? state.notes.map((note) =>
              note.id === action.editingNoteId ? action.note : note,
            )
          : [action.note, ...state.notes],
        draft: createEmptyDraft(),
        editingNoteId: null,
        imageError: "",
      };
    case "noteEdited":
      return {
        ...state,
        draft: {
          title: action.note.title,
          body: action.note.body,
          category: action.note.category,
          symbol: action.note.symbol,
          images: [...(action.note.images ?? [])],
        },
        editingNoteId: action.note.id,
        imageError: "",
      };
    case "noteDeleted":
      return {
        ...state,
        notes: state.notes.filter((note) => note.id !== action.noteId),
        draft:
          state.editingNoteId === action.noteId ? createEmptyDraft() : state.draft,
        editingNoteId:
          state.editingNoteId === action.noteId ? null : state.editingNoteId,
        imageError: state.editingNoteId === action.noteId ? "" : state.imageError,
      };
    case "notePinnedToggled":
      return {
        ...state,
        notes: state.notes.map((note) =>
          note.id === action.noteId
            ? { ...note, pinned: !note.pinned, updatedAt: action.updatedAt }
            : note,
        ),
      };
    case "draftReset":
      return { ...state, draft: createEmptyDraft(), editingNoteId: null, imageError: "" };
    case "queryChanged":
      return { ...state, query: action.query };
    case "filterChanged":
      return { ...state, filter: action.filter };
    default:
      return state;
  }
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

function NoteImageGrid({
  images,
  onRemove,
}: {
  images: NoteImage[];
  onRemove?: (imageId: string) => void;
}) {
  if (!images.length) return null;

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {images.map((image) => (
        <div
          key={image.id}
          className="overflow-hidden rounded-lg border border-border/70 bg-background/35"
        >
          <div className="relative aspect-video bg-muted">
            <Image
              src={image.dataUrl}
              alt={image.name || "Imagen del apunte"}
              fill
              sizes="(min-width: 1280px) 260px, (min-width: 640px) 45vw, 90vw"
              className="object-cover"
              unoptimized
            />
            {onRemove ? (
              <Button
                type="button"
                variant="secondary"
                size="icon-sm"
                aria-label={`Quitar imagen ${image.name}`}
                className="absolute right-2 top-2"
                onClick={() => onRemove(image.id)}
              >
                <X data-icon="inline-start" />
              </Button>
            ) : null}
          </div>
          <div className="flex min-w-0 items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
            <ImageIcon aria-hidden="true" />
            <span className="truncate">{image.name || "Imagen"}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function NotesHeaderCard() {
  return (
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
  );
}

function NoteFormCard({
  canSubmit,
  draft,
  draftImages,
  editingNote,
  imageError,
  imageInputRef,
  onDraftCategoryChange,
  onDraftFieldChange,
  onImageInput,
  onRemoveDraftImage,
  onResetDraft,
  onSubmit,
  symbols,
}: {
  canSubmit: boolean;
  draft: NoteDraft;
  draftImages: NoteImage[];
  editingNote: TradeNote | null;
  imageError: string;
  imageInputRef: React.RefObject<HTMLInputElement | null>;
  onDraftCategoryChange: (category: NoteCategory) => void;
  onDraftFieldChange: (field: DraftTextField, value: string) => void;
  onImageInput: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveDraftImage: (imageId: string) => void;
  onResetDraft: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  symbols: string[];
}) {
  return (
    <Card className="border-border/70 bg-card/70">
      <CardHeader>
        <CardTitle>{editingNote ? "Editar apunte" : "Nuevo apunte"}</CardTitle>
        <CardDescription>
          Captura contexto operativo antes de que se pierda.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-5" onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="note-title">Título</FieldLabel>
              <Input
                id="note-title"
                value={draft.title}
                onChange={(event) => onDraftFieldChange("title", event.target.value)}
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
                  if (nextCategory) onDraftCategoryChange(nextCategory);
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
                onChange={(event) => onDraftFieldChange("symbol", event.target.value)}
                placeholder="Opcional"
              />
              <datalist id="note-symbols">
                {symbols.map((symbol) => (
                  <option key={symbol} value={symbol}>
                    {symbol}
                  </option>
                ))}
              </datalist>
            </Field>
            <Field>
              <FieldLabel htmlFor="note-body">Nota</FieldLabel>
              <Textarea
                id="note-body"
                value={draft.body}
                onChange={(event) => onDraftFieldChange("body", event.target.value)}
                placeholder="Qué pasó, qué viste y qué decisión tomarás después."
                className="min-h-44 resize-y"
              />
            </Field>
            <Field>
              <FieldLabel>Imágenes</FieldLabel>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                aria-label="Añadir imágenes al apunte"
                multiple
                className="sr-only"
                onChange={onImageInput}
              />
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={draftImages.length >= MAX_NOTE_IMAGES}
                  >
                    <ImageIcon data-icon="inline-start" />
                    Añadir imagen
                  </Button>
                  <Badge variant="outline">
                    {draftImages.length}/{MAX_NOTE_IMAGES} imágenes
                  </Badge>
                </div>
                <NoteImageGrid images={draftImages} onRemove={onRemoveDraftImage} />
              </div>
              <FieldDescription>
                JPG, PNG o WebP. Máximo 1 MB por imagen.
              </FieldDescription>
              {imageError ? (
                <p className="text-sm text-destructive">{imageError}</p>
              ) : null}
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
              <Button type="button" variant="outline" onClick={onResetDraft}>
                <X data-icon="inline-start" />
                Cancelar
              </Button>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function NoteListItem({
  note,
  onDeleteNote,
  onEditNote,
  onTogglePinned,
}: {
  note: TradeNote;
  onDeleteNote: (noteId: string) => void;
  onEditNote: (note: TradeNote) => void;
  onTogglePinned: (noteId: string) => void;
}) {
  return (
    <article
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
            {note.symbol ? <Badge variant="outline">{note.symbol}</Badge> : null}
            <span className="text-xs text-muted-foreground">
              {formatNoteDate(note.updatedAt)}
            </span>
          </div>
          <h2 className="mt-3 text-base font-semibold text-foreground">{note.title}</h2>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={note.pinned ? "Soltar apunte" : "Fijar apunte"}
            onClick={() => onTogglePinned(note.id)}
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
            onClick={() => onEditNote(note)}
          >
            <Pencil data-icon="inline-start" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Eliminar apunte"
            onClick={() => onDeleteNote(note.id)}
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
      {(note.images ?? []).length ? (
        <div className="mt-3">
          <NoteImageGrid images={note.images ?? []} />
        </div>
      ) : null}
    </article>
  );
}

function NotesListCard({
  filter,
  notesCount,
  onDeleteNote,
  onEditNote,
  onFilterChange,
  onQueryChange,
  onTogglePinned,
  query,
  visibleNotes,
}: {
  filter: NotesFilter;
  notesCount: number;
  onDeleteNote: (noteId: string) => void;
  onEditNote: (note: TradeNote) => void;
  onFilterChange: (filter: NotesFilter) => void;
  onQueryChange: (query: string) => void;
  onTogglePinned: (noteId: string) => void;
  query: string;
  visibleNotes: TradeNote[];
}) {
  return (
    <Card className="border-border/70 bg-card/70">
      <CardHeader className="gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,360px)] lg:items-start">
        <div className="min-w-0">
          <CardTitle>Lista de apuntes</CardTitle>
          <CardDescription>
            {visibleNotes.length} visibles de {notesCount} guardados.
          </CardDescription>
        </div>
        <CardAction className="col-start-1 row-start-2 w-full lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:w-[340px]">
          <InputGroup className="h-10 sm:h-10">
            <InputGroupAddon>
              <Search aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Buscar apunte"
              aria-label="Buscar apuntes"
            />
          </InputGroup>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ToggleGroup
          aria-label="Filtrar apuntes"
          className="flex-wrap"
          onValueChange={(value) => {
            const nextFilter = value[0] as NotesFilter | undefined;
            if (nextFilter) onFilterChange(nextFilter);
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
              <NoteListItem
                key={note.id}
                note={note}
                onDeleteNote={onDeleteNote}
                onEditNote={onEditNote}
                onTogglePinned={onTogglePinned}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-border/70 bg-background/25 p-6 text-sm text-muted-foreground">
            No hay apuntes para ese filtro.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function NotesReferenceSection({
  workspace,
}: {
  workspace: WorkspaceState;
}) {
  const symbols = React.useMemo(() => getSymbols(workspace), [workspace]);
  const imageInputRef = React.useRef<HTMLInputElement>(null);
  const hydratedRef = React.useRef(false);
  const [state, dispatch] = React.useReducer(
    notesUiReducer,
    initialNotesUiState,
  );
  const { notes, draft, editingNoteId, query, filter, imageError } = state;
  const normalizedQuery = buildNoteSearchText(query);
  const editingNote = notes.find((note) => note.id === editingNoteId) ?? null;
  const draftImages = draft.images ?? [];
  const canSubmit = Boolean(
    draft.title.trim() || draft.body.trim() || draftImages.length,
  );

  React.useEffect(() => {
    let mounted = true;

    queueMicrotask(() => {
      if (!mounted) return;

      hydratedRef.current = true;
      dispatch({
        type: "notesLoaded",
        notes: parseStoredNotes(window.localStorage.getItem(NOTES_STORAGE_KEY)),
      });
    });

    return () => {
      mounted = false;
    };
  }, []);

  React.useEffect(() => {
    if (!hydratedRef.current) return;

    window.localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
  }, [notes]);

  const visibleNotes = React.useMemo(() => {
    return notes
      .filter(
        (note) =>
          (filter === "all" || note.category === filter) &&
          matchesQuery(note, normalizedQuery),
      )
      .toSorted((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;

        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [filter, normalizedQuery, notes]);

  function resetDraft() {
    dispatch({ type: "draftReset" });
  }

  async function handleImageInput(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";

    if (!files.length) return;

    const remainingSlots = MAX_NOTE_IMAGES - draftImages.length;

    if (remainingSlots <= 0) {
      dispatch({
        type: "imageErrorChanged",
        imageError: `Máximo ${MAX_NOTE_IMAGES} imágenes por apunte.`,
      });
      return;
    }

    const nextFiles = files.slice(0, remainingSlots);
    const rejectedByCount = files.length > remainingSlots;
    const rejectedByType = nextFiles.filter((file) => !file.type.startsWith("image/"));
    const rejectedBySize = nextFiles.filter(
      (file) => file.size > MAX_NOTE_IMAGE_BYTES,
    );
    const readableFiles = nextFiles.filter(
      (file) =>
        file.type.startsWith("image/") && file.size <= MAX_NOTE_IMAGE_BYTES,
    );

    if (!readableFiles.length) {
      dispatch({
        type: "imageErrorChanged",
        imageError: "Selecciona imágenes de hasta 1 MB.",
      });
      return;
    }

    try {
      const images = await Promise.all(readableFiles.map(readImageFile));

      dispatch({ type: "draftImagesAdded", images });

      if (rejectedByType.length || rejectedBySize.length || rejectedByCount) {
        dispatch({
          type: "imageErrorChanged",
          imageError: `Se añadieron ${images.length}. Solo se permiten ${MAX_NOTE_IMAGES} imágenes JPG/PNG/WebP de hasta 1 MB.`,
        });
      } else {
        dispatch({ type: "imageErrorChanged", imageError: "" });
      }
    } catch {
      dispatch({
        type: "imageErrorChanged",
        imageError: "No se pudo cargar alguna imagen. Inténtalo de nuevo.",
      });
    }
  }

  function removeDraftImage(imageId: string) {
    dispatch({ type: "draftImageRemoved", imageId });
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
      images: draftImages,
    };

    dispatch({
      type: "noteSubmitted",
      editingNoteId,
      note: editingNote
        ? {
            ...editingNote,
            ...nextDraft,
            updatedAt: now,
          }
        : {
            id: createNoteId(),
            ...nextDraft,
            pinned: false,
            createdAt: now,
            updatedAt: now,
          },
    });
  }

  function editNote(note: TradeNote) {
    dispatch({ type: "noteEdited", note });
  }

  function deleteNote(noteId: string) {
    dispatch({ type: "noteDeleted", noteId });
  }

  function togglePinned(noteId: string) {
    const now = new Date().toISOString();

    dispatch({ type: "notePinnedToggled", noteId, updatedAt: now });
  }

  return (
    <PageMotion>
      <div className="grid gap-4">
        <NotesHeaderCard />
        <NotesStats notes={notes} />
        <div className="grid gap-4 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
          <NoteFormCard
            canSubmit={canSubmit}
            draft={draft}
            draftImages={draftImages}
            editingNote={editingNote}
            imageError={imageError}
            imageInputRef={imageInputRef}
            onDraftCategoryChange={(category) =>
              dispatch({ type: "draftCategoryChanged", category })
            }
            onDraftFieldChange={(field, value) =>
              dispatch({ type: "draftFieldChanged", field, value })
            }
            onImageInput={handleImageInput}
            onRemoveDraftImage={removeDraftImage}
            onResetDraft={resetDraft}
            onSubmit={submitNote}
            symbols={symbols}
          />
          <NotesListCard
            filter={filter}
            notesCount={notes.length}
            onDeleteNote={deleteNote}
            onEditNote={editNote}
            onFilterChange={(nextFilter) =>
              dispatch({ type: "filterChanged", filter: nextFilter })
            }
            onQueryChange={(nextQuery) =>
              dispatch({ type: "queryChanged", query: nextQuery })
            }
            onTogglePinned={togglePinned}
            query={query}
            visibleNotes={visibleNotes}
          />
        </div>
      </div>
    </PageMotion>
  );
}
