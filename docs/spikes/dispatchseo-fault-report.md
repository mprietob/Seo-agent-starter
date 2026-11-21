# Fallos y credenciales compartidas — 2026-09-09

## Resultado

Se caracterizaron nueve casos contra el commit `fbf28b2ee58bbbd6ee94dbd61e0bb9627bb59a26`, con la imagen ya construida y sin modificar archivos upstream. La primera ejecución registró ocho resultados esperados y un fallo de fixture; la repetición específica de GSC corrigió el fixture y obtuvo el resultado esperado. No es una única ejecución de nueve passes.

Tres observaciones **no cumplen los requisitos de Gabi**: fallback automático con token legacy, acceso de A al repositorio B con token compartido y consulta de acceso de A a propiedad GSC B con cuenta compartida. Son resultados de caracterización, no vulnerabilidades demostradas en una instalación real ni una certificación de seguridad.

Evidencias: [primera ejecución](dispatchseo-fault-results.json), [repetición GSC](dispatchseo-gsc-mock-results.json). Procedimiento: [laboratorio](../../lab/README.md).

## C06: fallos de base de datos

Se interpuso un proxy de laboratorio entre la app y PostgREST. Inyecta respuestas 503, cierre de conexión, tabla projects ausente y columna ai_choice ausente. No se corrompió ni modificó el esquema real; tampoco se reprodujo una caída física de Postgres.

| Caso | Observación |
| --- | --- |
| Normal | Los tokens A/B resuelven su dominio esperado |
| HTTP 503, desconexión y tabla ausente | Tokens A/B: HTTP 401, sin datos de sitio. Health: HTTP 503 |
| Columna ai_choice ausente | La selección compatible con columnas anteriores conserva dominio y aprobación desactivada |
| HTTP 503 con token MCP_API_KEY legacy | get_project devuelve dominio vacío, mode=auto, auto_approve=true y merge_enabled=true |
| Restauración del transporte | A/B recuperan su contexto sin reiniciar el proceso |

El 401 durante una caída confunde credencial inválida con dependencia no disponible. Gabi debe distinguirlo mediante salud/errores y no pedir al usuario rotar claves automáticamente. El caso legacy caracteriza flags devueltos; no ejecutó builds, merges ni publicaciones. merge_enabled refleja la presencia de la credencial sintética, no la viabilidad de publicar durante la caída.

Fuentes fijadas: [getProjectByToken y fallback](https://github.com/NeoZi12/dispatchseo/blob/fbf28b2ee58bbbd6ee94dbd61e0bb9627bb59a26/src/lib/projects.ts), [health](https://github.com/NeoZi12/dispatchseo/blob/fbf28b2ee58bbbd6ee94dbd61e0bb9627bb59a26/src/app/api/health/route.ts).

## C13: recursos externos

La instrumentación de proceso redirige fetch y https.request de los hosts concretos de GitHub/Google al simulador HTTP dentro de la red aislada. Genera una credencial GitHub aleatoria y una identidad RSA de servicio exclusivamente ficticia. El simulador no habla con Google ni GitHub; no hay claves reales. La app y los proveedores falsos siguen sin salida a Internet.

El proveedor simulado concede al token de instancia acceso al recurso B: esta es una **precondición explícita**. No se demuestra acceso a recursos que el proveedor denegaría; se demuestra que, si una credencial compartida ya puede acceder a B, el token de sitio A no impone otro límite sobre ese recurso.

### GitHub

Mediante set_github_repo, B y después A eligen `gabi-lab-fixture/site-b`. El upstream valida acceso al repo y sus commits usando la misma credencial. get_next_actions de A devuelve el PR ficticio de B. Las cinco peticiones observadas comparten la misma etiqueta de credencial. No se llamó merge_pr ni se escribió en el proveedor simulado.

Fuentes: [validación self-hosted de repo](https://github.com/NeoZi12/dispatchseo/blob/fbf28b2ee58bbbd6ee94dbd61e0bb9627bb59a26/src/lib/repo-connect.ts), [resolución del token](https://github.com/NeoZi12/dispatchseo/blob/fbf28b2ee58bbbd6ee94dbd61e0bb9627bb59a26/src/lib/github.ts).

### Search Console

set_gsc_property acepta para ambos sitios `sc-domain:site-b.gabi-lab.example.org`. Con las métricas sintéticas temporalmente retiradas, get_site_stats provoca dos probes de acceso a esa propiedad mediante el mismo token del simulador. Ambos devuelven la nota de acceso concedido. Se confirma un probe de acceso, no extracción masiva de métricas de B ni el flujo de cron.

La primera referencia `site-b.example` fue rechazada por la validación de hosts privados del motor. Se conservó ese fallo y se repitió solo el caso afectado con el subdominio de documentación `example.org`. No se debilitó la validación upstream. Las métricas y las referencias originales se restauran en finally.

Fuentes: [cliente GSC compartido en self-hosting](https://github.com/NeoZi12/dispatchseo/blob/fbf28b2ee58bbbd6ee94dbd61e0bb9627bb59a26/src/lib/gsc.ts), [validación y guardado de propiedad](https://github.com/NeoZi12/dispatchseo/blob/fbf28b2ee58bbbd6ee94dbd61e0bb9627bb59a26/src/lib/gsc-oauth.ts), [hosts rechazados](https://github.com/NeoZi12/dispatchseo/blob/fbf28b2ee58bbbd6ee94dbd61e0bb9627bb59a26/src/lib/url-guard.ts).

## Límites y trabajo siguiente

Al terminar se recreó app con la configuración base, sin preload. Se verificaron ambos sitios, métricas conservadas, referencias de proveedores nuevamente nulas y flags de build/merge desactivados. Todos los contenedores del proyecto quedaron detenidos.

- Solo modo self-hosted; no se probó el aislamiento OAuth/GitHub App del modo cloud.
- El simulador no valida JWT como Google ni reproduce cuotas, TLS, revocación externa, consentimiento o todos los errores de proveedores.
- No se ha ejecutado una publicación, una migración incompleta real ni una prueba exhaustiva de todas las herramientas.
- C06/C13 quedan caracterizados en estos caminos, no cerrados como criterios del producto Gabi.
- La adopción técnica sigue pendiente. [ADR-011](../../DECISIONS.md) fija controles necesarios; el siguiente entregable es el contrato de fachada y su threat model, antes de implementar o conectar el piloto.
