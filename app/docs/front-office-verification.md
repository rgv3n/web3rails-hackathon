# Front office — verificación (registro vivo)

Cada fase añade su sección. Resultado observado, no esperado. Fecha y comando.

## Fase 1 · 9-oct-2026 · entorno local (Supabase 573xx, Next dev en :3000)

### Pruebas automáticas
Comando: `npm test` (Vitest, `tests/phase1.test.ts`, contra el Supabase local con cinco usuarios reales y dos organizaciones creadas en la propia prueba y borradas al final).

Resultado: **13 pruebas, 13 en verde** (1,2 s).

| Regla (spec §4) | Prueba | Observado |
|---|---|---|
| 2 Ingestión idempotente | reimportar mismo fichero | inserted 0 · duplicate 1 · total movimientos 1 |
| 2 Diferencia no se descarta | reimportar con importe distinto | discrepant 1 · `import_discrepancies` guarda stored/incoming · excepción `import_discrepancy` abierta · importe almacenado intacto |
| 3 Origen separado de interpretación | update directo sobre `movements` como admin | 0 filas afectadas (sin política de update) |
| 1 Aislamiento por organización | org B lee/importa/edita por ID de org A | lectura vacía · `FORBIDDEN` en import y contexto · auditoría vacía |
| 1 Auditor solo lectura | auditor importa / edita contexto / update | `FORBIDDEN` · `FORBIDDEN` · 0 filas |
| Precisión monetaria | importe de 39 dígitos con 18 decimales | exacto en BD y exacto por la API gracias a `amount_raw_text` (la primera versión de la prueba FALLÓ: PostgREST devolvía `1.2345678901234568e+38`; corregido con columnas de texto generadas) |
| Dirección por wallet declarada | from = wallet propia | `direction = out`, wallet correcta |
| Fila sin wallet propia | to y from externas | rechazada con error por fila |
| 12 Concurrencia | dos operadores guardan sobre la misma versión a la vez | exactamente 1 éxito y 1 `CONFLICT`; versión final 2 |
| 12 Versión obsoleta | guardar con versión 0 cuando la actual es 1 | `CONFLICT`, ninguna revisión escrita |
| Revisiones + auditoría | primer guardado | revisión 1 · `identified` · evento `created` con `reason` y actor |
| 4 Transferencia interna | categoría `internal_transfer` sin contraparte | `identified` · conciliación `not_applicable`; volver a `unknown` → `unidentified` / `unmatched` |
| 11 Corrección tras aprobación | registro aprobado + nueva revisión | vuelve a `pending` · revisiones 1-5 conservadas · auditoría marca `approval_invalidated` |

### Recorrido en navegador (Chrome, cuenta admin+reviewer de la org Acme Ltd.)
1. `/app/movements/import` → subir `docs/samples/movements.sample.csv` → previsualización: 3 filas, 2 válidas, 1 rechazada por firma no base58 (la muestra se corrigió después). Importar → «2 inserted · 0 already present · 0 differ · 0 rejected». Historial de importaciones muestra el lote.
2. `/app/movements` → dos filas con fecha en la zona horaria de la org, entidad, «Unknown», importe exacto con signo, «No valuation», «Pending», atención «Financial context missing», acción «Resolve».
3. Detalle → cuatro bloques. Guardar revisión 1 (Vendor payment · Northwind Hosting SL · NW-2026-0912 · motivo) → «Saved as revision 1», la cabecera pasa a «Identified», el historial muestra v1 (Current) y el evento `movement_context created` con el motivo. Comprobado en BD: `context_version 1`, `identified`.
4. Al recargar, todo persiste.

### Comprobaciones de construcción
`npx tsc --noEmit` limpio · `npm run lint` limpio · `npm run build` limpio (12 rutas).

### Limitaciones reales
- No hay sincronización con la cadena: sin credencial de proveedor. La UI lo dice («Chain sync: not configured»).
- No hay valoración fiat: sin fuente de tipos. La UI muestra «No valuation», nunca 0.
- Facturas, matching, excepciones generales, aprobación y exportación: fases 3-4, marcadas «In development» en la UI.
- Invitaciones de miembros: pendiente; hoy se añaden por SQL o por el backoffice futuro.
- La prueba de «corrección tras aprobación» fija `review_status = approved` por SQL porque el flujo de aprobación no existe todavía.
- Las direcciones del CSV de muestra son ficticias con formato válido; los enlaces al explorador se construyen pero no resuelven a transacciones reales.

## Fase 2 · 9-oct-2026

Bandeja: paginación en servidor (50 por página, conteo exacto), ordenación por fecha o importe, filtros aplicados en base de datos, línea «data as of last import … · chain sync not configured», estados de carga (`loading.tsx`), error (`error.tsx` con reintento) y no encontrado (`not-found.tsx`). Los filtros se conservan al volver del detalle por el parámetro `back`. `tsc`, `lint` y `build` limpios. Sin pruebas automáticas nuevas: la paginación se verificó con la bandeja de Acme (2 filas, 1 página).

## Fase 3 · 9-oct-2026

### Pruebas automáticas
Comando: `npm test` → **25 pruebas, 25 en verde** (13 de fase 1 + 12 de fase 3, `tests/phase3.test.ts`).

| Regla (spec §4 / §8) | Observado |
|---|---|
| 2 Importar facturas idempotente | mismo `external_ref` con mismos datos → duplicate; con datos distintos → error por fila «already exists with different…», valores almacenados intactos |
| 3 Token por mint, no por símbolo | USDC → mint mapeado; factura en EUR importa con `token_mint null` y no genera candidatos; movimiento USDT no casa con factura USDC del mismo importe |
| 8 Señales por nombre, sin porcentaje | propuesta con `{reference_exact, counterparty_known, amount_compatible, date_window}`; evento `match proposed` con `actor_kind = system`, `actor_id null` |
| 9 Propuesta ≠ aceptación | tras proponer, la factura sigue `open` y sin vínculo; aceptar exige operator/reviewer (auditor → `FORBIDDEN`) y deja `match_decisions` con actor y motivo |
| 6 Tolerancia explícita | 4250,02 frente a 4250,00 con tolerancia 0,01 → sin candidato → excepción `no_invoice` con la tolerancia en el motivo |
| 7 Ambigüedad | dos facturas de 100 → dos propuestas, excepción `ambiguous_match`, `matched_invoice_id null` |
| Pago parcial | 3000 contra factura de 9000 de la misma contraparte → `unsupported_partial`, sin coincidencia ficticia |
| 7 Factura consumida | enlace manual sobre factura ya vinculada → `CONFLICT: invoice INV-1 is already linked` |
| 12 Carrera | dos operadores enlazan la misma factura a dos movimientos a la vez → 1 éxito, 1 `CONFLICT`, un solo vínculo en BD |
| Desvincular y rechazar | desvincular sin motivo → rechazado; con motivo → factura `open`, matching se relanza y propone; rechazar el único candidato → `unmatched` + `no_invoice` |
| Excepciones | resolver sin resolución → rechazado; «en espera» sin comentario → rechazado; auditor → `FORBIDDEN`; espera con responsable y comentario, resolución por otro operador con `resolved_by` |
| Aprendizaje solo con confirmación | `counterparty_addresses` se escribe únicamente al aceptar con `learn_address = true` |

Fallo real encontrado por las pruebas y corregido: `text[] || 'literal'` en PL/pgSQL se interpretaba como literal de array («malformed array literal»); se cambió a `array_append`.

### Recorrido en navegador (Acme Ltd., admin + reviewer)
1. `/app/invoices/import` → `docs/samples/invoices.sample.csv` → previsualización 2 válidas → importar → matching ejecutado.
2. `/app/reconciliation` → dos movimientos con candidatos: Northwind con las cuatro señales en verde (diferencia 0,00, tolerancia 0,01, −8 días); el de 4.250 USDC solo con importe y fecha (contraparte desconocida), marcado como decisión explícita.
3. Aceptar Northwind con motivo → desaparece de la cola; en BD factura `matched` y vinculada, decisión `accept` con motivo, auditoría `match accept` (user) después de dos `match proposed` (system).

### Limitaciones reales
- Tolerancia inicial 0,01 unidades del token y ventana de 30 días: valores decididos por Rubén el 9-oct, visibles en cada propuesta y editables por admin en Cuenta → Reconciliation policy.
- Autoaprobación desactivada por defecto; el interruptor existe pero la aprobación (fase 4) aún no.
- Facturas en fiat no se pueden casar hasta que exista valoración.
- Pagos parciales y agrupados quedan como excepción; la operación agrupada (contrato backoffice §2) es v2.

## Fase 4 · 9-oct-2026

### Pruebas automáticas
Comando: `npm test` → **33 pruebas, 33 en verde** (`tests/phase4.test.ts` añade 8).

| Regla (spec §4 / §8) | Observado |
|---|---|
| 10 Aprobar exige campos completos y sin excepciones | `approval_blockers` devuelve «context incomplete» y «Not reconciled»; `review_movement('approve')` responde `BLOCKED: …` con las razones |
| Permiso de aprobación | operator → `FORBIDDEN`; reviewer aprueba; fila en `reviews` con actor y versión; auditoría `review approved` |
| Política de autoaprobación (decisión 9-oct) | por defecto, el autor de la revisión o de la aceptación no puede aprobar aunque sea admin+reviewer («Self-approval is off…»); otro reviewer sí; al activar el interruptor por organización (auditado) el autor puede |
| Devolver | sin motivo → rechazado; con motivo → `correction_requested`, excepción asignada al autor de la revisión; una nueva revisión la resuelve y vuelve a `pending` |
| 11 Corrección material tras aprobación | invalida (`reviews` = approved, invalidated), vuelve a `pending`, el export anterior conserva sus filas y su checksum; un export nuevo del mismo periodo sale con 0 registros |
| 13 Export = snapshot | solo registros aprobados del periodo; fila congelada en `export_items.row` con importe exacto (`amount_raw` 4250000000, `amount` 4250), referencia de factura, aprobador y cadena de evidencia (movement;revision;review;invoice); checksum SHA-256 registrado |
| Permisos y aislamiento | auditor no exporta (`FORBIDDEN`); otra organización no lee `exports` ni `export_items` |
| Neutralización de fórmulas | `=Acme Customer SA` sale como `'=Acme…` en el CSV y permanece intacto en los datos; columnas numéricas nunca se alteran; comas y comillas escapadas |

### Descarga
`/app/exports/[id]/download` regenera el CSV desde las filas congeladas, devuelve `X-Checksum-SHA256` y `X-Checksum-Matches-Recorded`, y registra `export downloaded` en auditoría con el checksum.

### Limitaciones reales
- La aprobación por lotes no existe: se aprueba registro a registro desde el detalle. Para un cierre de 500 movimientos hará falta una vista de cierre (fase 5 / v2).
- El fichero no se guarda en Storage: se regenera desde el snapshot, que es inmutable por diseño (`export_items` sin políticas de escritura). Si un cliente exige el binario original, se añade Storage con el mismo checksum.
- Sin valoración fiat las columnas `fiat_value` y `fiat_currency` salen vacías, nunca 0.

## Fase 5 · 9-oct-2026

### Pruebas automáticas
Comando: `npm test` → **45 pruebas, 45 en verde** en 5 ficheros. Nuevos: `tests/helius-mapper.test.ts` (4) y `tests/pilot.test.ts` (8, escenario de aceptación §8 completo).

### Escenario de aceptación del piloto (§8), observado
Organización piloto con dos entidades (ES en EUR, UK en USD), tres wallets declaradas, dos operadores, un revisor, un auditor; segunda organización para aislamiento. Conjunto etiquetado de 7 movimientos y 5 facturas (una referencia duplicada en el mismo fichero).

| Comprobación §8 | Resultado |
|---|---|
| Reimportar no duplica | 7 movimientos y 4 facturas tras dos importaciones (duplicate 7 / 5) |
| Coincidencia válida aceptada con explicación | propuesta con 4 señales; decisión `accept` conserva la propuesta y sus señales |
| Candidato ambiguo no se convierte en vínculo | dos facturas de 77 → `ambiguous_match`, `matched_invoice_id null` |
| Factura no se vincula dos veces por carrera | dos operadores a la vez → 1 éxito, 1 `CONFLICT` |
| Excepción resuelta con motivo y actor | `resolved_by` y `resolution` del segundo operador |
| Registro incompleto no se aprueba | `BLOCKED: … Not reconciled` |
| Corrección material invalida aprobación y conserva revisiones | `pending`, 2 revisiones, export anterior con el mismo checksum |
| Auditor no muta; otra organización no accede por ID | `FORBIDDEN` en contexto/export, update sin filas; 7 tablas vacías para la otra org |
| Exportación con revisiones aprobadas e importes exactos | 1 fila, `amount_raw 4250000000`, `amount 4250`, entidad y aprobador correctos |
| Recargar conserva decisiones; el historial explica el recorrido | cliente nuevo ve el mismo estado; auditoría contiene `movement_context:created → match:proposed → match:accept → review:approved → review:invalidated → movement_context:revised` |
| Extra: entidad UK no casa facturas de la entidad ES | `unmatched` + `no_invoice` |
| Extra: token por mint (USDT vs USDC) con referencia e importe exactos | sin candidato |
| Extra: transferencia interna | `not_applicable` sin factura |
| Extra: valoración ausente | 0 valoraciones; la UI muestra «No valuation» y la cobertura 0 / N |

Refinamiento salido del escenario: la regla de «pago parcial» era demasiado amplia (cualquier importe menor que alguna factura de la misma contraparte). Ahora: diferencia pequeña con la factura más cercana → `amount_mismatch` con la cifra y la factura; diferencia grande y existe una factura mayor → `unsupported_partial` indicando cuánto falta. Umbral de «pequeña»: máx(100 × tolerancia, 5 % del importe), documentado en el motivo.

### Sincronización con Helius (loop A)
- Tablas `sync_jobs` + checkpoint por wallet (`sync_cursor`, `last_synced_at`, `last_sync_error`), funciones `start_sync_job` (bloquea trabajos simultáneos) y `finish_sync_job` (el cursor solo avanza cuando el recorrido terminó; un recorrido parcial se marca `partial` y no mueve el cursor).
- Adaptador `src/lib/helius.ts`: importes desde `rawTokenAmount` (entero), nunca desde floats; mints conocidos solamente; si la contraparte no se determina, la fila se omite y se cuenta, no se inventa. Fetch acotado: 100 por página, 10 páginas por ejecución, timeout 15 s, 3 reintentos con espera creciente en 429/5xx.
- **No probado contra Helius real**: no hay `HELIUS_API_KEY`. El mapeador tiene 4 pruebas unitarias con la forma documentada de la respuesta. La UI muestra «Chain sync: not configured» y el botón «Sync now» aparece deshabilitado con el motivo.

### Inicio
Cifras reales (wallets, movimientos, sin contexto, excepciones abiertas, aprobados), último lote importado, estado de sync por wallet, trabajos fallidos en 7 días, cobertura de valoración N / M, y la ruta hasta el primer export con pasos marcados.

### Qué NO se declara
- MVP «operativo con cadena real»: falta la credencial de Helius y una primera sincronización verificada con una wallet real.
- Validación contable del controller y revisión de seguridad externa: fuera de este registro, como dice la especificación.

## Recuperación de contraseña · 10-oct-2026

Rutas nuevas: `/forgot-password` (pedir enlace), `/auth/callback` (intercambia `code` o `token_hash` por sesión y redirige con `Location` relativo), `/reset-password` (exige sesión; `updateUser`). Enlace «Forgot your password?» en `/login`. El alta ahora pasa su `emailRedirectTo` por el mismo callback.

Prueba de extremo a extremo contra Supabase local + Mailpit + `next dev` (script temporal, no commiteado), con el mismo cliente `@supabase/ssr` que usa la acción de servidor:

| Paso | Observado |
|---|---|
| Petición de enlace | Correo «Reset your password» en Mailpit; tres cookies `code-verifier` en el navegador que lo pidió |
| Enlace de Supabase | `/auth/v1/verify?…&type=recovery` → redirige a `/auth/callback?code=…&next=/reset-password` |
| Callback con la cookie de verificación | 303 `/reset-password`, 1 cookie de sesión |
| Pantalla | 200 con el formulario «Choose a new password» |
| `updateUser` con esa sesión | la contraseña antigua deja de valer; la nueva entra |
| Mismo enlace sin la cookie (otro dispositivo) o reutilizado | `/login?error=link-expired` con aviso en pantalla |

Limitación real: con el mailer por defecto de Supabase el enlace solo funciona en el navegador que lo pidió (PKCE). Las plantillas en `supabase/templates/` (enlace con `token_hash`, válido en cualquier dispositivo) están listas pero el plan Free las rechaza hasta configurar un SMTP propio. El mailer por defecto además limita a unos pocos correos por hora: no sirve para clientes reales.

Nube: usuario owner `rubengl@gmail.com` creado confirmado el 10-oct por API de administración; login comprobado.

## Verificación de propiedad de wallet con certificado digital · 10-oct-2026

Rutas nuevas: `/app/organization/wallets/[id]/verify` (pantalla), `POST /api/attestations` (emite la declaración con nonce, 15 min), `POST /api/attestations/[id]/verify` (verifica la CAdES y registra el veredicto). Migración `20261010200000_wallet_attestations.sql`: tabla `wallet_ownership_attestations`, funciones `issue_wallet_attestation` (admin) y `record_wallet_attestation` (admin + prueba HMAC). Catálogo: «Digital certificate (FNMT / eIDAS)» disponible en beta.

Diseño de confianza: el servidor Next verifica firma, cadena, OCSP e identidad (`src/lib/attestation/verify-cades.ts`) y firma su veredicto con HMAC-SHA256 (`ATTESTATION_HMAC_SECRET`); la función SQL recalcula el HMAC con el mismo secreto guardado en Supabase Vault (`attestation_hmac`) y rechaza cualquier veredicto sin prueba válida. El front office sigue sin usar la clave de servicio. Perfiles: `qualified` (raíz FNMT, OCSP obligatorio) para organizaciones reales; `demo` (añade la CA inventada «Web3Rails Demo Root», sin OCSP, etiquetado) solo cuando `organizations.is_demo`.

### Pruebas automáticas
`npm test` → **50 pruebas, 50 en verde** (5 nuevas en `tests/attestation.test.ts`, firmas producidas con openssl y el certificado demo publicado en `public/demo-certificate/`).

| Regla | Observado |
|---|---|
| Emitir exige admin | operador → `FORBIDDEN`; la declaración lleva la wallet y un nonce de 24 hex; perfil `qualified` o `demo` según la organización |
| Certificado demo | aceptado en organización demo (ancla `demo`, OCSP omitido y etiquetado); rechazado en organización real («no termina en una autoridad confiable»); rechazado si el contenido incrustado difiere del emitido |
| Veredicto sin prueba HMAC válida | `FORBIDDEN: verdict proof does not match` (prueba para otro firmante, o basura); la wallet sigue `declared` |
| Operador con prueba válida | `FORBIDDEN` (solo admin) |
| Veredicto genuino | wallet `verified`, `ownership_evidence = attestation:<id>`, atestación con firmante y certificado, evento `wallet ownership_verified` |
| Repetición de la misma atestación | `CONFLICT: attestation already verified` |
| Veredicto rechazado | se registra con motivos y evento `ownership_verification_rejected`; la wallet no cambia |
| Declaración caducada | estado `expired` persistido; la ruta devuelve 410 |

### Recorrido real en local (script temporal, no commiteado)
Organización demo creada por API → página de verificación renderiza con el aviso demo → `POST /api/attestations` → la declaración se firma con **Autofirma 1.9 real** (CLI, mismo motor que el navegador) y el certificado demo → `POST …/verify` → `verified`, firmante «00000000T MARIA EJEMPLO (R: B00000000)», cadena «… > Web3Rails Demo Root» → en BD `ownership = verified` → la página muestra «Verified» y el firmante → la lista de wallets enlaza «Ownership evidence» → reenviar la misma firma: 409 → la misma firma en una organización real: `rejected`, wallet sigue `declared`.

### Limitaciones reales
- No probado desde el navegador con Autofirma (requiere instalación con permisos de sistema en esta máquina). El cliente web es el oficial (`public/autofirma/autoscript.js`, modo WebSocket). Prueba pendiente en el equipo de Rubén con su certificado real.
- Solo escritorio; sin firma de la wallet Solana (segunda firma) todavía: la evidencia es la del certificado.
- Un certificado de persona física pasa la verificación y queda marcado `natural_person` (sin CIF); la pantalla lo dice. La política «solo representante de persona jurídica» es una decisión de producto pendiente.
- La validación de cadena de pkijs no evalúa políticas de certificación ni QCStatements eIDAS; se confía en el ancla (raíz FNMT).

## Selector de organización · 10-oct-2026

Hallazgo en producción: el owner tenía tres organizaciones (dos creadas por él y la demo) y la app mostraba siempre la más antigua, así que la wallet de la demo daba 404. Ahora `requireOrg` lee la cookie `w3r_org`, la valida contra las membresías del usuario y cae a la más antigua si no es válida; el selector aparece en la barra lateral y en móvil cuando hay más de una; crear una organización la activa. Probado en local: sin cookie → primera; cookie de la segunda → segunda; cookie de una organización ajena → primera (ignorada). Sin pruebas automáticas nuevas (comportamiento de interfaz).

## Phantom: declarar wallet y probar el control con la clave · 11-oct-2026

Migración `20261011100000_wallet_key_proofs.sql`: `wallet_ownership_attestations.method` (`certificate` | `wallet_key`), `wallets.control_verified_at` y `control_evidence`; `issue_wallet_attestation(p_wallet, p_method)`; `record_wallet_attestation` pone `ownership = verified` si el método es certificado y `control_verified_at` si es la clave de la wallet. Dos pruebas independientes y visibles por separado: «Identity verified» (certificado) y «Control proven» (clave).

Interfaz: en Organization, «Connect Phantom» lee la dirección pública del proveedor inyectado (sin SDK, solo `connect`) y la declara con la entidad y la etiqueta; en la pantalla de verificación de la wallet, «Sign with Phantom» emite la declaración con método `wallet_key`, la firma con `signMessage` y la envía a `POST /api/attestations/[id]/verify-wallet`, que verifica ed25519 con `@noble/ed25519` contra la clave pública de la dirección (base58) y registra el veredicto con la misma prueba HMAC. Phantom debe estar conectado a la misma dirección que la wallet; si no, se avisa y no se firma. Nunca se pide una transacción.

### Pruebas automáticas
`npm test` → **51 pruebas, 51 en verde** (1 nueva): clave propia → control probado, identidad sin cambios, evento `control_verified`; declaración alterada, clave ajena y firma de longitud incorrecta → rechazadas con motivo.

### Recorrido real en local (par de claves haciendo de Phantom)
Organization muestra «Connect Phantom» → página de verificación con la tarjeta «Prove control with the wallet key» → emisión `wallet_key` → firma → `verify-wallet` 200 `verified` → `control_verified_at` en BD → la página muestra «Control proven» y la identidad sigue «Declared» → la lista enlaza «Ownership evidence». Fallo encontrado por el recorrido y corregido: la ruta del certificado aceptaba declaraciones de método `wallet_key` (ahora 400 en ambos sentidos). Clave ajena → `rejected` con motivo.

### Limitaciones reales
- No probado con la extensión Phantom real en un navegador (el proveedor inyectado se ha simulado con un par de claves ed25519, que es lo que Phantom firma). Pendiente en el equipo de Rubén.
- Solo Phantom (y proveedores que expongan `window.solana.isPhantom`); Solflare, Backpack y Wallet Standard quedan para después.
- La sincronización con Helius sigue sin ejecutarse contra la cadena.

## Identidad atada al CIF, declaración neutra y pruebas enlazadas · 11-oct-2026 (revisión de Ignacio Montoya)

Migración `20261011150000_identity_binding.sql`: `legal_entities.tax_id`, `tax_id_country`, `subject_type` (`legal_entity` | `natural_person`); `wallet_ownership_attestations.linked_attestation_id` y `ocsp_response_der`; `create_organization(…, p_tax_id, p_subject_type)`; `issue_wallet_attestation(p_wallet, p_method, p_link)`; `record_wallet_attestation(…, p_ocsp_der)`.

- **Declaración neutra (v2).** «The holder of the signing certificate declares that the wallet X is controlled by <entidad> (tax id <CIF>)». No presupone quién firma; el tipo de firmante se registra al verificar.
- **Política del firmante** (`src/lib/attestation/policy.ts`, aplicada en la ruta tras la criptografía): entidad `legal_entity` → certificado de representante con `organizationIdentifier` igual al CIF de la entidad; `natural_person` → NIF del certificado igual al identificador de la persona; sin CIF en la entidad → rechazo con motivo. Prefijos ETSI (`VATES-`, `IDCES-`…) normalizados.
- **Pruebas enlazadas.** La declaración de clave de wallet puede emitirse con `link` a una atestación de certificado ya verificada: lleva `certificate_attestation_id` y `certificate_signature_sha256` (SHA-256 de la CAdES), de modo que la clave acepta exactamente lo que firmó el representante. Solo se admite si la atestación enlazada es del mismo wallet, método certificado y verificada.
- **Evidencia duradera.** Se guarda la respuesta OCSP firmada (DER, base64). Sello de tiempo (CAdES-T): hoja de ruta.

### Pruebas automáticas
`npm test` → **55 pruebas, 55 en verde** (4 nuevas): normalización de identificadores; política para empresa (CIF igual pasa; otro CIF, certificado personal o sin CIF fallan) y para persona física; enlace: antes de verificar el certificado se rechaza, después la declaración lleva el hash correcto, al registrarla queda `linked_attestation_id` y la wallet con identidad verificada y control probado; enlace a atestación de otro wallet rechazado.

### Recorrido por las rutas (firma real de Autofirma con el certificado demo)
Entidad con CIF B99999999 → `rejected`: «the certificate represents tax id B00000000, not B99999999», wallet sigue `declared`. Entidad con B00000000 → `verified`, firmante `company_representative VATES-B00000000`. Declaración de clave enlazada → `verified`, la página muestra «linked to this certificate signature» y el CIF.

### Pendiente
- Organización unipersonal automática para particulares (decisión de producto; la política ya soporta `natural_person`).
- Sello de tiempo CAdES-T.
- La organización demo en la nube recibe `tax_id = B00000000` con la migración.
