import { fechaUTC, isoDeFecha, diasEntre, sumarDias, hoyUTC } from "./fechas";
import type { Alerta, AlquilerMensual, CanonVigenteConfig, Contrato } from "./tipos";

/**
 * Porta contratoAlquileres/src/alerts.py — cruza contratos + datos de CBCs +
 * canon_vigente para calcular los 5 tipos de alerta (7 combinaciones
 * prioridad/tipo_alerta). `hoy` recibe un Date en medianoche UTC (ver
 * lib/alquileres/fechas.ts) para que el cálculo de días sea determinístico en
 * los tests, igual que el parámetro `hoy: Optional[date]` de la función Python.
 */

const DIAS_ALERTA_VENCIMIENTO = [180, 90, 60, 30];
const DIAS_ALERTA_AJUSTE = 7;

const MES_ES: Record<number, string> = {
  1: "Ene",
  2: "Feb",
  3: "Mar",
  4: "Abr",
  5: "May",
  6: "Jun",
  7: "Jul",
  8: "Ago",
  9: "Sep",
  10: "Oct",
  11: "Nov",
  12: "Dic",
};

const PRIORIDAD_ORDEN: Record<string, number> = {
  "CRÍTICA": 0,
  URGENTE: 1,
  "PRÓXIMA": 2,
  INFORMATIVA: 3,
};

export function calcularAlertas(
  contratos: Record<string, Contrato[]>,
  alquileres: AlquilerMensual[],
  canonVigente: CanonVigenteConfig,
  hoy: Date = hoyUTC()
): Alerta[] {
  const alertas: Alerta[] = [
    ..._alertasVencimiento(contratos, hoy),
    ..._alertasPago(alquileres, canonVigente, hoy),
    ..._alertasAjuste(canonVigente, hoy),
    ..._alertasProrroga(contratos, canonVigente, hoy),
    ..._alertasNoMapeados(alquileres),
  ];

  return alertas.sort((a, b) => {
    const pa = PRIORIDAD_ORDEN[a.prioridad] ?? 99;
    const pb = PRIORIDAD_ORDEN[b.prioridad] ?? 99;
    if (pa !== pb) return pa - pb;
    const fa = a.fechaEvento ?? "9999-12-31";
    const fb = b.fechaEvento ?? "9999-12-31";
    return fa < fb ? -1 : fa > fb ? 1 : 0;
  });
}

// ── A. Pagos ────────────────────────────────────────────────────────────────

function _alertasPago(
  alquileres: AlquilerMensual[],
  canonVigente: CanonVigenteConfig,
  hoy: Date
): Alerta[] {
  const alertas: Alerta[] = [];
  const mesActual = `${MES_ES[hoy.getUTCMonth() + 1]}-${String(hoy.getUTCFullYear()).slice(2)}`;
  const diaHoy = hoy.getUTCDate();

  for (const [local, cv] of Object.entries(canonVigente)) {
    const diaDesde = cv.diaPagoDesde ?? 1;
    const diaHasta = cv.diaPagoHasta ?? 10;
    const alquilerMes = alquileres.find((a) => a.local === local && a.mes === mesActual) ?? null;
    const pagado = alquilerMes ? alquilerMes.totalPagado > 0 : false;

    if (diaHoy >= diaDesde && !pagado) {
      const fechaEvento = isoDeFecha(new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), diaHasta)));
      const diasRestantes = diaHasta - diaHoy;
      if (diaHoy <= diaHasta) {
        alertas.push({
          prioridad: "URGENTE",
          local,
          tipoAlerta: "PAGO_PENDIENTE",
          descripcion: `Ventana de pago abierta (del ${diaDesde} al ${diaHasta}), sin pago registrado.`,
          fechaEvento,
          diasRestantes,
          accionRequerida: "Verificar si el pago fue realizado y está pendiente de carga en CBC.",
        });
      } else {
        alertas.push({
          prioridad: "CRÍTICA",
          local,
          tipoAlerta: "PAGO_VENCIDO",
          descripcion: `Ventana de pago cerró el día ${diaHasta}, sin pago registrado.`,
          fechaEvento,
          diasRestantes,
          accionRequerida: "Confirmar pago urgente y cargar en CBC.",
        });
      }
    }
  }
  return alertas;
}

// ── B. Ajuste de canon ────────────────────────────────────────────────────────

function _alertasAjuste(canonVigente: CanonVigenteConfig, hoy: Date): Alerta[] {
  const alertas: Alerta[] = [];
  for (const [local, cv] of Object.entries(canonVigente)) {
    const proximo = cv.proximoAjuste;
    if (!proximo) continue;
    const delta = diasEntre(proximo, hoy);
    if (delta <= DIAS_ALERTA_AJUSTE) {
      const tipo = delta === 0 ? "AJUSTE_HOY" : "AJUSTE_PROXIMO";
      const prioridad = delta <= 0 ? "CRÍTICA" : "URGENTE";
      alertas.push({
        prioridad,
        local,
        tipoAlerta: tipo,
        descripcion: `Ajuste de canon (${cv.indiceAjuste ?? "?"}) vence el ${proximo}.`,
        fechaEvento: proximo,
        diasRestantes: delta,
        accionRequerida: "Calcular nuevo canon y actualizar contrato.",
      });
    }
  }
  return alertas;
}

// ── C. Vencimiento de contrato ────────────────────────────────────────────────

function _alertasVencimiento(contratos: Record<string, Contrato[]>, hoy: Date): Alerta[] {
  const alertas: Alerta[] = [];
  for (const [local, rows] of Object.entries(contratos)) {
    const vigentes = rows.filter((c) => c.estado === "Vigente" && c.vencimiento);
    for (const contrato of vigentes) {
      const delta = diasEntre(contrato.vencimiento!, hoy);
      for (const umbral of DIAS_ALERTA_VENCIMIENTO) {
        if (delta <= umbral) {
          const prioridad = delta <= 30 ? "CRÍTICA" : delta <= 90 ? "URGENTE" : "PRÓXIMA";
          alertas.push({
            prioridad,
            local,
            tipoAlerta: "VENCIMIENTO_CONTRATO",
            descripcion: `Contrato vence el ${contrato.vencimiento} (${delta} días).`,
            fechaEvento: contrato.vencimiento,
            diasRestantes: delta,
            accionRequerida: "Revisar opciones de prórroga o renovación.",
          });
          break;
        }
      }
    }
  }
  return alertas;
}

// ── D. Prórroga ───────────────────────────────────────────────────────────────

function _alertasProrroga(
  contratos: Record<string, Contrato[]>,
  canonVigente: CanonVigenteConfig,
  hoy: Date
): Alerta[] {
  const alertas: Alerta[] = [];
  for (const [local, rows] of Object.entries(contratos)) {
    const vigentes = rows.filter((c) => c.estado === "Vigente" && c.vencimiento);
    const cv = canonVigente[local];
    const preaviso = cv?.preavisoProrrogaDias ?? 30;
    for (const contrato of vigentes) {
      const fechaDecision = sumarDias(fechaUTC(contrato.vencimiento!), -(preaviso + 30));
      const delta = Math.round((fechaDecision.getTime() - hoy.getTime()) / 86_400_000);
      if (delta <= 60) {
        const prioridad = delta <= 0 ? "CRÍTICA" : delta <= 30 ? "URGENTE" : "PRÓXIMA";
        const fechaDecisionIso = isoDeFecha(fechaDecision);
        alertas.push({
          prioridad,
          local,
          tipoAlerta: "DECISION_PRORROGA",
          descripcion: `Decidir prórroga antes del ${fechaDecisionIso} (preaviso ${preaviso} días).`,
          fechaEvento: fechaDecisionIso,
          diasRestantes: delta,
          accionRequerida: `Notificar decisión al locador con ${preaviso} días de anticipación al ${contrato.vencimiento}.`,
        });
      }
    }
  }
  return alertas;
}

// ── E. Proveedores no mapeados ────────────────────────────────────────────────

function _alertasNoMapeados(alquileres: AlquilerMensual[]): Alerta[] {
  return alquileres
    .filter((a) => a.local.startsWith("_DESCONOCIDO_"))
    .map((a) => ({
      prioridad: "INFORMATIVA",
      local: a.local,
      tipoAlerta: "PROVEEDOR_NO_MAPEADO",
      descripcion: `Proveedor '${a.proveedorCbc}' no tiene local asignado en locales_mapping.json.`,
      fechaEvento: null,
      diasRestantes: null,
      accionRequerida: "Agregar entrada en config/locales_mapping.json.",
    }));
}
