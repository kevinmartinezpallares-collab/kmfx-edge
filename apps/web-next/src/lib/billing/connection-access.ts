type RecordLike = Record<string, unknown>;

export type ConnectionAccessReason =
  | "allowed"
  | "auth_required"
  | "billing_required"
  | "billing_past_due"
  | "entitlement_required"
  | "plan_limit_reached"
  | "billing_status_unavailable";

export type ConnectionAccess = {
  allowed: boolean;
  message: string;
  reason: ConnectionAccessReason;
  status: number;
};

function asRecord(value: unknown): RecordLike {
  return value && typeof value === "object" ? (value as RecordLike) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function hasPositiveConnectionLimit(value: unknown): boolean {
  if (typeof value === "number") {
    return value > 0;
  }

  const normalized = asString(value).toLowerCase();
  return normalized === "custom" || normalized === "unlimited";
}

export function resolveConnectionAccess(payload: unknown): ConnectionAccess {
  const data = asRecord(payload);

  if (data.auth_required === true) {
    return {
      allowed: false,
      message: "Inicia sesión para conectar cuentas y descargar archivos.",
      reason: "auth_required",
      status: 401,
    };
  }

  if (data.ok === false) {
    return {
      allowed: false,
      message: "No se pudo comprobar el plan ahora. Inténtalo de nuevo.",
      reason: "billing_status_unavailable",
      status: 503,
    };
  }

  if (data.is_admin === true) {
    return {
      allowed: true,
      message: "Plan verificado. Puedes generar la KMFX Key y descargar los archivos.",
      reason: "allowed",
      status: 200,
    };
  }

  const billing = asRecord(data.billing);
  const entitlements = asRecord(data.entitlements);
  const limits = asRecord(data.limits);
  const billingAccess = asString(billing.access);

  if (billingAccess === "restricted") {
    return {
      allowed: false,
      message: "Activa un plan para añadir cuentas y descargar launcher/EA.",
      reason: "billing_required",
      status: 402,
    };
  }

  if (billingAccess === "billing_attention") {
    return {
      allowed: false,
      message: "Regulariza la suscripción para conectar cuentas y descargar archivos.",
      reason: "billing_past_due",
      status: 402,
    };
  }

  if (entitlements.launcherConnection !== true) {
    return {
      allowed: false,
      message: "Activa un plan para añadir cuentas y descargar launcher/EA.",
      reason: "entitlement_required",
      status: 403,
    };
  }

  const connectionLimit = limits.connectionKeyLimit ?? limits.liveMt5Accounts;
  if (!hasPositiveConnectionLimit(connectionLimit)) {
    return {
      allowed: false,
      message: "Tu plan no permite más cuentas MT5. Revisa la suscripción.",
      reason: "plan_limit_reached",
      status: 403,
    };
  }

  return {
    allowed: true,
    message: "Plan verificado. Puedes generar la KMFX Key y descargar los archivos.",
    reason: "allowed",
    status: 200,
  };
}
