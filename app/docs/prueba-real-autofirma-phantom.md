# Prueba real: certificado FNMT con AutoFirma + wallet Solana con Phantom

Escrito el 12-oct-2026 para la prueba en el equipo de Rubén. Dura unos 20 minutos.

## Dónde

- **app.web3rails.io**, rama `main`. Las migraciones alojadas van hasta `20261011100000` (comprobado el 12-oct con `supabase migration list --linked`): certificado y Phantom están desplegados. No hace falta mergear las PR 1-5 para esta prueba.
- Organización **Web3rails** (real, perfil `qualified`), no la demo. En la demo el certificado FNMT también vale, pero la demo acepta además la CA inventada y la prueba sería menos limpia.
- Autoridades aceptadas: `AC RAIZ FNMT-RCM` como raíz, con las intermedias `AC FNMT Usuarios` (persona física) y `AC Representación` (representante de persona jurídica). Cualquiera de los dos tipos de certificado FNMT encadena. DNIe, Camerfirma y otros prestadores todavía no.

## Antes de empezar (en el equipo de Rubén)

1. **AutoFirma** instalada (firmaelectronica.gob.es, 1.8 o superior). El navegador habla con ella por WebSocket local; la primera vez pide permiso para abrir `afirma://`: aceptar.
2. El **certificado FNMT** instalado en el almacén del sistema o del navegador (donde AutoFirma lo vea). Si pide PIN o contraseña, es la del certificado.
3. **Chrome o Edge** de escritorio. Nada de móvil.
4. **Phantom** instalado, desbloqueado y con la cuenta que se va a declarar seleccionada. La red de Phantom da igual: solo se firma un mensaje, nunca una transacción.
5. Sesión en la app como `rubengl@gmail.com` y, en el selector de la barra lateral, la organización **Web3rails**.

## Parte A · Phantom (5 min)

1. `Organization` → **Connect Phantom**. Phantom pide aprobar la conexión: aceptar. La app solo lee la dirección pública.
2. Elegir la entidad legal, poner etiqueta (por ejemplo «Treasury · Phantom») → **Declare this wallet**. La wallet aparece como `declared`.
3. Abrir la wallet → `Verify`. Tarjeta **Prove control with the wallet key** → **Sign with Phantom**. Phantom muestra el texto exacto de la declaración y pide firmarlo.
4. Resultado esperado: «Control proven: the wallet key signed the statement». En la lista, la wallet enseña **Control proven**; la identidad sigue en `Declared`.

Si Phantom está en otra cuenta distinta de la declarada, la app avisa y no firma: cambiar de cuenta en Phantom y repetir.

## Parte B · AutoFirma (10 min)

1. Misma wallet → `Verify` → **Issue statement**. La declaración caduca a los 15 minutos; si se pasa, **Issue a new statement**.
2. **Sign with AutoFirma**. Se abre AutoFirma, se elige el certificado, y la firma CAdES vuelve a la página.
3. El servidor comprueba firma, cadena hasta `AC RAIZ FNMT-RCM`, revocación por OCSP contra la FNMT e identidad, y registra el veredicto con la prueba HMAC.
4. Resultado esperado: «Signature, chain, revocation and identity check out». La página enseña firmante, cadena, revocación y hora; la lista marca **Identity verified**.

Con un certificado de persona física el firmante queda etiquetado `natural_person` (sin CIF). Con uno de representante, `company_representative` con el CIF. En `main` ambos se aceptan; la PR 1 añade la regla «el CIF del certificado tiene que ser el de la entidad», así que si se mergea antes de la prueba hay que rellenar antes el NIF o CIF de la entidad en `Organization`.

## Qué se guarda y dónde

- La firma (que incluye el certificado público, nombre y NIF del firmante) y el veredicto van a `wallet_ownership_attestations` en el Supabase alojado de Web3Rails (eu-west-1), visibles solo para los admin de la organización.
- **Nada va a la cadena**: ni el certificado, ni la revocación, ni la identidad. Phantom firma un mensaje, no una transacción.
- Para el vídeo del hackathon y para cualquier captura, usar la organización **Acme Ltd. (demo)** con el certificado demo: la pantalla real enseña el NIF del firmante.

## Si algo falla

| Síntoma | Qué significa | Qué hacer |
|---|---|---|
| «AutoFirma client script not loaded» | el script no cargó | recargar la página con sesión iniciada |
| No se abre AutoFirma / «Waiting for AutoFirma…» eterno | AutoFirma no instalada o el navegador bloqueó `afirma://` | instalar o permitir; cerrar AutoFirma y repetir |
| «does not end in a trusted authority» | el certificado no es FNMT | anotar el emisor (sale en el motivo); queda para la lista de confianza eIDAS |
| Rechazo con motivo de OCSP | el servidor no llegó al OCSP de la FNMT o la respuesta no validó | anotar el motivo literal; repetir una vez |
| 410 al firmar | declaración caducada | **Issue a new statement** y firmar en menos de 15 min |
| Phantom «not installed» | la extensión no inyecta `window.solana` | desbloquear Phantom y recargar |

## Qué apuntar (sin NIF ni capturas de la pantalla real)

- Veredicto de cada parte y hora.
- Tipo de firmante mostrado (`natural_person` o `company_representative`) y cadena mostrada.
- Si falla: el texto literal del motivo y el paso en el que ocurrió.

## Después

- Verde en A y B: mergear PR 1 → 2 → 3, `supabase db push` a producción, resembrar la demo y grabar el vídeo con la organización demo.
- Rojo en B por emisor no FNMT o por OCSP: se arregla en una rama aparte; la prueba A y el vídeo no dependen de ello.
