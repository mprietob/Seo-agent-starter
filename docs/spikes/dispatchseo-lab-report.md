# Ensayo local de DispatchSEO — 2026-09-09

Ampliación posterior: [fallos de BD y credenciales simuladas](dispatchseo-fault-report.md). Este informe conserva el alcance del ensayo base.

## Resultado y alcance

DispatchSEO se construyó desde `fbf28b2ee58bbbd6ee94dbd61e0bb9627bb59a26` sin modificar código upstream. Compilación Next.js, TypeScript y generación de páginas completadas. Las migraciones terminaron con código 0; app y Postgres estuvieron healthy; el health HTTP desde Windows devolvió 200.

El ensayo final registra **12 comprobaciones de caracterización correctas**. No equivale a completar las 14 pruebas de aceptación de Gabi ni acredita aislamiento integral de credenciales. El núcleo y la fachada de Gabi todavía no existen.

Evidencia: [resultados y esquemas MCP](dispatchseo-lab-results.json), [entorno e imágenes](dispatchseo-lab-environment.json), [primera pasada](dispatchseo-lab-first-pass.json). Reproducción: [laboratorio](../../lab/README.md).

## Qué se comprobó

| Área | Resultado observado |
| --- | --- |
| Autenticación | Sin token y con token desconocido: HTTP 401. Tras rotar token B, el antiguo dejó de funcionar y el nuevo accedió a B |
| Transporte | Handshake MCP con protocolo 2024-11-05; inventario real de 73 herramientas en modo agente y 19 en modo chat |
| Lecturas A/B | get_project, get_suggestions y get_site_stats devolvieron el contexto y los datos esperados de cada sitio ficticio |
| Concurrencia | 20 lecturas alternadas A/B en paralelo sin mezcla de dominio |
| Escritura cruzada | Intentos A→idea B y B→idea A rechazados; el estado del objeto ajeno permaneció intacto |
| Aprobación | decided_by=agent mantuvo pending; decided_by=owner permitió approved. Confirma la carencia para Gabi: el motor no acredita por sí solo la identidad humana |
| Entradas inválidas | UUID malformado rechazado con isError; el mensaje de validación es texto, no JSON |
| GSC no conectado | Sin snapshots ni propiedad, get_site_stats avisó de falta de conexión; los datos posteriores fueron fixtures sintéticos |
| Modo chat | Cambió el inventario, mantuvo el sitio asociado al token. No se probó una política Gabi inexistente |
| Red | App solo en red internal=true; una solicitud HTTPS a example.com no pudo completarse. No se capturó tráfico de red ni se probaron todos los destinos |

## Dos incidencias del ensayo

1. El lector inicial intentaba parsear como JSON todos los errores MCP. Una validación del SDK devolvió texto y produjo SyntaxError en el harness. Se corrigió el lector para reconocer isError antes de parsear. La primera pasada conserva 11 passes y ese fallo del harness; la segunda conserva 12 passes. El futuro adaptador debe contemplar tanto fallos JSON de handlers como texto del SDK.
2. Docker Desktop no publicó el puerto de la app al estar conectada únicamente a una red interna. Se añadió Nginx con entrada loopback y destino fijo app:3000. App y BD siguen sin pertenecer a la red de entrada. El health desde Windows pasó a HTTP 200. El proxy no expone PostgREST y no tiene un destino arbitrario configurable por petición.

## Condiciones del laboratorio

Dos sitios `.example`, ideas y métricas sintéticas; cuentas reales no conectadas. Credenciales efímeras del laboratorio fuera de Git; tokens de proyecto solo en memoria del harness y BD. No se ejecutaron cron ni builders. Los proyectos de prueba tienen los flags automáticos desactivados y publicación manual.

Los fixtures se prepararon directamente en la BD aislada para evitar configurar cuentas mediante el wizard. Este acceso privilegiado verifica efectos; no demuestra autorización del dashboard ni es una API que Gabi deba consumir.

Imágenes de Postgres, PostgREST y proxy fijadas por digest en Compose. La app fue construida desde fuente fijada; su digest y el digest de Node usado por la construcción se conservan en el manifiesto. El Dockerfile upstream mantiene una etiqueta de Node: reconstruir en otra fecha puede resolver una base distinta. No se afirma reproducibilidad binaria entre reconstrucciones.

Contenedores detenidos al terminar, sin borrar el volumen ni las imágenes. Los códigos de salida observados durante Stop corresponden a la parada solicitada; la salud se verificó antes. Se puede repetir con `lab/run.ps1 Up` y `Probe`.

## Pendientes que impiden cerrar adopción

- C05: queda probar lectura cruzada por ID y referencias de drafts, además de las escrituras de ideas ya ensayadas.
- C06: caída de BD, esquema incompleto y todos los caminos de fallback.
- C07: implementar y probar la aprobación autenticada de Gabi; el pass actual solo caracteriza la diferencia upstream.
- C08-C10: idempotencia tras timeout, correspondencia PR/publicación y manejo completo de fallos en el futuro adaptador. Solo se ensayó entrada UUID inválida del upstream.
- C11-C12: frescura de datos y permisos invariantes en la futura fachada Gabi.
- C13: aislamiento de credenciales GSC/GitHub con dobles de proveedores; no se ha demostrado usando cuentas reales.
- C14: restauración desde backup y persistencia verificada tras reinicio. Reutilizar un volumen durante este ensayo no sustituye ese caso.
- Threat model, contratos versionados y ADR de adopción técnica.

## Siguiente paso recomendado

Mantener ADR-002: composición como dirección, adopción pendiente. Preparar el contrato de fachada con lista explícita de capacidades permitidas, identidad por sitio y aprobación autenticada fuera del modelo. Antes de elegir stack o habilitar escrituras, resolver C06 y C13 y decidir cómo impedir el acceso directo de agentes al token upstream. No se propone un fork basándose solo en este ensayo.
