# Front office — plan de ejecución (fase 0, 9-oct-2026)

Especificación: `docs/front-office-implementation.md`. Plan de producto anterior: `../docs/2026-10-09-front-office-plan.md` (sigue válido para contexto; donde choca, manda la especificación).

## Estado real del repositorio

| Pieza | Estado | Dónde |
|---|---|---|
| Landing pública | Separada, en producción (`../site`, web3rails.io). No se toca. | `../site` |
| Framework | Next.js 16 App Router, TS, Tailwind 4, lucide. Sin shadcn, sin librería de tablas. | `package.json` |
| Auth | Supabase Auth (email + contraseña), sesión refrescada en `src/proxy.ts`. | `src/lib/supabase/*` |
| Persistencia | Supabase Postgres local (puertos 573xx). Migraciones en `supabase/migrations`. | `supabase/` |
| Aislamiento | RLS por `org_id` con `is_member` / `has_role` (security definer). | `20261009120000_foundation.sql` |
| Roles | `owner / reviewer / auditor`. La especificación pide `admin / operator / reviewer / auditor` → migrar. | memberships |
| Auditoría | `audit_events` append-only con actor, antes/después. Falta `reason`. | idem |
| API externa | No existe. Las claves API se emiten y guardan (hash), pero no hay endpoints. | `/app/integrations` |
| Jobs / sync | No hay mecanismo de jobs ni proveedor Solana configurado (sin credencial Helius). | — |
| Pruebas | Ninguna. | — |
| Diseño | Tokens de marca copiados de la landing; primitivas en `src/components/ui.tsx`. | — |

## Mapa de capacidades requeridas

| Capacidad | Estado | Decisión |
|---|---|---|
| Organización, miembros, auditoría | Existe | Reutilizar; añadir `reason` y nuevos roles |
| Entidad legal, wallet declarada | Falta | Fase 1 |
| Movimiento con clave estable, importe exacto, estados separados | Falta | Fase 1 |
| Contexto financiero versionado + conflicto por versión | Falta | Fase 1 |
| Valoración fiat | Falta (sin fuente) | Tabla en fase 1; sin datos → «No valuation» |
| Ingestión real Solana | Bloqueada (sin credencial de proveedor, sin jobs) | Importación explícita CSV con validación en fase 1; sync en fase 5 si hay credencial |
| Facturas, propuesta y decisión de match, excepciones | Falta | Fase 3 (la tabla `exceptions` nace en fase 1 para discrepancias de importación) |
| Aprobación, exportación snapshot | Falta | Fase 4 |
| Inicio con datos reales, administración | Parcial (overview con ceros) | Fase 5 |
| Modo demo separado | Falta | Organización `is_demo` + origen `demo` en movimientos; sin acceso a nada real |

## Decisiones de diseño (fase 1)

- **Clave de idempotencia del movimiento**: `(org_id, chain, tx_signature, instruction_index, token_mint, from_address, to_address)`. Una firma de Solana puede contener varias transferencias; el índice de instrucción las separa. Si una reimportación trae la misma clave con distinto importe, fecha o estado, no se sobrescribe: se registra en `import_discrepancies` y se abre una excepción `import_discrepancy`.
- **Importes**: `amount_raw numeric(39,0)` en unidad mínima + `token_decimals`. Formateo con BigInt en el cliente. Nunca float.
- **Token** = `(chain, token_mint)`; el símbolo es solo etiqueta.
- **Origen frente a interpretación**: `movements` guarda el origen y no se edita; el contexto financiero vive en `movement_context_revisions` (una fila por versión). `movements.context_version` apunta a la actual.
- **Concurrencia**: `save_movement_context(expected_version)` bloquea la fila y rechaza con `CONFLICT` si la versión cambió. La interfaz muestra el conflicto y ofrece recargar.
- **Estados separados** en `movements`: `source_status` (cadena), `identification_status`, `reconciliation_status`, `review_status`. Una corrección material sobre un registro aprobado lo devuelve a `pending` (regla 11) conservando revisiones.
- **Permisos en servidor**: toda mutación financiera pasa por funciones `security definer` que comprueban rol; las políticas RLS de lectura siguen por organización. Admin gestiona organización, entidades, wallets y accesos; puede tener un `financial_role` explícito (operator o reviewer) para actuar sobre registros.
- **Sin LLM, sin porcentajes de confianza.** Las señales de matching (fase 3) se listan por nombre.

## Estado por fase

| Fase | Estado | Evidencia |
|---|---|---|
| 0 | Hecha 9-oct | este documento |
| 1 | Hecha 9-oct | `docs/front-office-verification.md` · migraciones `…140000_contracts.sql`, `…150000_exact_text_amounts.sql` · 13 pruebas |
| 2 | Hecha 9-oct | paginación/ordenación en servidor, loading/error/not-found |
| 3 | Hecha 9-oct | migración `…170000_matching.sql` · 12 pruebas · `front-office-verification.md` |
| 4 | Hecha 9-oct | migración `…180000_review_export.sql` · 8 pruebas (33 en total) |
| 5 | Hecha 9-oct salvo la sync real | migración `…190000_sync_jobs.sql`, adaptador Helius (sin clave: no probado en vivo), escenario §8 automatizado (45 pruebas en total) |

## Orden y dependencias

1. Fase 1 — migración de contratos y roles; importación CSV validada; lista y detalle de movimiento; edición de contexto con revisión y conflicto; auditoría visible; pruebas de aislamiento, auditor, idempotencia, discrepancia, concurrencia y precisión.
2. Fase 2 — bandeja completa (filtros en servidor, paginación, estados vacíos/errores) y detalle de cuatro bloques.
3. Fase 3 — facturas, matching 1:1 determinista con tolerancia configurada por organización (sin valor por defecto), excepciones.
4. Fase 4 — aprobación, política de autoaprobación, exportación snapshot CSV.
5. Fase 5 — inicio con datos reales, administración, sync Solana si hay credencial, verificación del piloto.

## Riesgos concretos

- Sin credencial de proveedor Solana no hay sincronización: el piloto arranca con importación manual. No se simula «wallet conectada».
- Sin fuente de tipos de cambio no hay valoración: se muestra «No valuation», nunca 0.
- La pila de pruebas se añade en fase 1 (Vitest contra el Supabase local). Sin ella no se declara ninguna regla verificada.

## Cómo ejecutar y probar

```bash
npx supabase start          # o `npx supabase migration up` si ya corre
npm run dev                 # http://localhost:3000
npm run build && npm run lint
npm test                    # Vitest contra el Supabase local (desde fase 1)
```
