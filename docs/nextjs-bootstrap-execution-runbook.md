# KMFX Next.js Bootstrap Execution Runbook

Estado: runbook previo a ejecucion  
Ultima revision: 2026-05-14  
Alcance: guia exacta para crear `apps/web-next` cuando decidamos pasar de documentacion a implementacion real.

## Proposito

Este runbook no se ejecuta todavia.

Su funcion es dejar el primer movimiento de implementacion tan claro que no tengamos que improvisar ni tomar decisiones base con el scaffold ya a medias.

## Objetivo del primer arranque

Crear una app paralela que:

- compila sola
- no toca el runtime actual
- ya nace con la estructura correcta
- ya nace preparada para `app-shell-5`
- ya nace preparada para Wave 1

## Pre-flight checklist

- [ ] confirmar que seguimos trabajando fuera del runtime actual
- [ ] confirmar que `apps/web-next` no existe o que su estado esta controlado
- [ ] confirmar rama de trabajo limpia para el scaffold
- [ ] confirmar roadmap maestro y bootstrap checklist vigentes

## Paso 1. Scaffold base

Comando previsto:

```bash
npx create-next-app@latest apps/web-next --yes --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --turbopack --use-npm
```

Verificacion:

- carpeta creada
- `package.json` presente
- `src/app` presente
- `next dev` arranca

## Paso 2. Inicializar shadcn

Comando previsto:

```bash
cd apps/web-next
npx shadcn@latest init --defaults
```

Verificacion:

- `components.json` creado
- `src/components/ui` presente
- aliases correctos

## Paso 3. Aplicar fixes obligatorios de Tailwind 4

Corregir:

- fuentes literales en `globals.css`
- variables de fuente en `<html>`, no en `<body>`

Verificacion:

- no cae en serif/Times
- no hay referencias circulares de fuente

## Paso 4. Instalar baseline de dependencias

Dependencias previstas:

- `framer-motion`
- `liveline`
- `recharts`
- `next-themes`
- `react-resizable-panels`
- `sonner`
- `lucide-react`
- `tw-animate-css`

Verificacion:

- `package.json` coherente
- lockfile actualizado

## Paso 5. Crear estructura base

Arbol minimo esperado:

```text
apps/web-next/
  src/
    app/
      layout.tsx
      page.tsx
      globals.css
      (workspace)/
        layout.tsx
        dashboard/page.tsx
        accounts/page.tsx
        risk/page.tsx
        analytics/page.tsx
    components/
      app/
      domain/
      ui/
      uitripled/
    features/
      dashboard/
      accounts/
      risk/
      analytics/
    lib/
      api/
      contracts/
      data/
      domain/
      formatters/
      store/
```

## Paso 6. Montar shell minimo

Archivos minimos:

- `app-shell.tsx`
- `workspace-sidebar.tsx`
- `workspace-topbar.tsx`
- `workspace-mobile-nav.tsx`
- `command-entry.tsx`

Verificacion:

- shell renderiza en desktop
- shell no rompe en mobile
- no usa datos reales aun si no toca

## Paso 7. Rutas Wave 1 placeholder

Rutas:

- `/dashboard`
- `/accounts`
- `/risk`
- `/analytics`

Verificacion:

- existen
- viven dentro del shell
- tienen placeholders estructurales, no pantallas vacias sin jerarquia

## Paso 8. Primer control de calidad

Comprobar:

- build
- lint
- arranque local
- dark mode base
- mobile shell base

## Criterios de no avanzar

No pasar a extraccion o integracion de datos si:

- el scaffold ya nace con dudas de estructura
- las fuentes/tokens no estan bien
- el shell no esta resuelto
- aparecen imports legacy por comodidad

## Entregable esperado al final del runbook

Una `apps/web-next` limpia, aislada y lista para empezar Fase 4 y Fase 5 del roadmap maestro.

## Relacion con documentos existentes

- `docs/nextjs-bootstrap-checklist.md`
- `docs/nextjs-dependency-and-command-manifest.md`
- `docs/nextjs-scaffold-file-spec.md`
- `docs/nextjs-master-migration-roadmap.md`
