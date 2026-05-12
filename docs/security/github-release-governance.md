# GitHub release governance

Objetivo: que `main` no pueda romper producción por error y que los secretos no
entren al repositorio.

## Estado en el repositorio

Ya existe en código:

- `.github/CODEOWNERS`
- `.github/dependabot.yml`
- workflow `CI`
- workflow `Production Smoke`
- workflow `Build Windows Launcher`

La parte que debe activarse en GitHub no vive en el checkout local. Debe quedar
confirmada en la configuración del repositorio.

## Auditoría reproducible

Ejecutar sin token:

```bash
python3 scripts/github_release_governance_audit.py
```

Esto valida los archivos locales y avisa de que los ajustes privados de GitHub
no pueden confirmarse.

Ejecutar con un token con permisos de administración/seguridad del repositorio:

```bash
export GITHUB_TOKEN="ghp_..."
python3 scripts/github_release_governance_audit.py --strict
```

El modo `--strict` debe pasar antes de considerar cerrado este bloque.

## Ajustes requeridos en GitHub

En `Settings > Code security and analysis`:

- Activar Secret scanning.
- Activar Push protection.
- Activar Dependabot alerts.
- Activar Dependabot security updates.

En `Settings > Branches` o `Rulesets`, proteger `main`:

- Exigir pull request antes de merge.
- Exigir al menos una aprobación.
- Exigir revisión de Code Owners.
- Invalidar aprobaciones antiguas cuando haya commits nuevos.
- Exigir que los status checks estén en verde.
- Exigir rama actualizada antes de merge si el flujo lo permite.
- Bloquear force push.
- Bloquear borrado de rama.
- Mantener historial lineal si no bloquea el flujo actual.

Checks obligatorios:

- `Backend and connector tests`
- `Static app checks`
- `Build Windows launcher`

## Nota sobre Windows launcher

El workflow de Windows intenta publicar el artefacto en `main`. Si branch
protection bloquea ese push directo, el workflow empuja una rama
`automation/windows-launcher-artifact-*` para que se pueda fusionar con PR.
Ese comportamiento es intencional y compatible con producción.

## Evidencia de cierre

Guardar en `docs/production-release-evidence.md`:

- fecha de activación de secret scanning;
- fecha de activación de push protection;
- captura o texto de branch protection/ruleset;
- salida de `python3 scripts/github_release_governance_audit.py --strict`;
- último commit con CI y Production Smoke en verde.
