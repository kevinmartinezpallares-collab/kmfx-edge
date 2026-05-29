import "server-only";

import { requestAuthenticatedBackendJson } from "@/lib/api/authenticated-backend";
import {
  resolveConnectionAccess,
  type ConnectionAccess,
} from "@/lib/billing/connection-access";

export async function requestConnectionAccess(): Promise<ConnectionAccess> {
  try {
    const result = await requestAuthenticatedBackendJson("/api/billing/status");

    if (!result.ok) {
      return {
        allowed: false,
        message: "No se pudo comprobar el plan ahora. Inténtalo de nuevo.",
        reason: "billing_status_unavailable",
        status: result.status >= 500 ? 503 : result.status,
      };
    }

    return resolveConnectionAccess(result.payload);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "auth_required";

    if (reason === "auth_required") {
      return {
        allowed: false,
        message: "Inicia sesión para conectar cuentas y descargar archivos.",
        reason: "auth_required",
        status: 401,
      };
    }

    return {
      allowed: false,
      message: "No se pudo comprobar el plan ahora. Inténtalo de nuevo.",
      reason: "billing_status_unavailable",
      status: 503,
    };
  }
}
