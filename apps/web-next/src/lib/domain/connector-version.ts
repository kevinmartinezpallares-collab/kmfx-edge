export const REQUIRED_KMFX_CONNECTOR_VERSION = "2.91";

export const KMFX_CONNECTOR_UPDATE_STEPS = [
  "Abre KMFX Launcher y selecciona la instancia MT5 de esta cuenta.",
  "Pulsa Reinstalar conector o copia el nuevo KMFXConnector.ex5 en MQL5/Experts.",
  "En MT5, elimina el EA del gráfico y vuelve a añadirlo, o reinicia MT5.",
  "Comprueba en la pestaña Expertos que aparece KMFX Connector v2.91 iniciado.",
] as const;

function parseConnectorVersion(value: string | undefined): number[] | null {
  const match = String(value || "")
    .trim()
    .match(/\d+(?:\.\d+)*/);

  if (!match) return null;

  return match[0].split(".").map((segment) => Number(segment));
}

export function normalizeConnectorVersion(value: unknown) {
  return String(value || "").trim();
}

export function compareConnectorVersions(
  currentVersion: string | undefined,
  requiredVersion = REQUIRED_KMFX_CONNECTOR_VERSION,
) {
  const current = parseConnectorVersion(currentVersion);
  const required = parseConnectorVersion(requiredVersion);

  if (!current || !required) return null;

  const length = Math.max(current.length, required.length);
  for (let index = 0; index < length; index += 1) {
    const currentPart = current[index] ?? 0;
    const requiredPart = required[index] ?? 0;
    if (currentPart !== requiredPart) return currentPart - requiredPart;
  }

  return 0;
}

export function requiresKmfxConnectorUpdate(
  connectorVersion: string | undefined,
  requiredVersion = REQUIRED_KMFX_CONNECTOR_VERSION,
) {
  const normalizedVersion = normalizeConnectorVersion(connectorVersion);
  if (!normalizedVersion) return false;

  if (normalizedVersion.toLowerCase() === "unknown") return true;

  const comparison = compareConnectorVersions(normalizedVersion, requiredVersion);
  return comparison !== null && comparison < 0;
}
