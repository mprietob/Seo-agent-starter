# Tanda 1 — Evaluación estática de DispatchSEO

Fecha: 2026-09-08. Base Gabi: `44959aac92fab27bdba877b189d2ed15417d53d2`.
Upstream inspeccionado: `fbf28b2ee58bbbd6ee94dbd61e0bb9627bb59a26`. La revisión anterior, `89fa4b7`, permanece como evidencia histórica; esta evaluación no presupone compatibilidad entre ambas versiones.

## Resultado

La composición sigue siendo la primera alternativa a probar, conforme a ADR-002. Hay una superficie MCP amplia que permite evaluar lecturas y cola sin copiar código. No se acepta todavía la adopción técnica ni se elige stack: faltan ejecución self-hosted, pruebas entre sitios y resolución del control de aprobaciones.

Esta entrega contiene lectura estática del código, una matriz y un inventario. No contiene un despliegue, una integración operativa ni pruebas de contrato ejecutadas. No se han conectado cuentas reales ni copiado código upstream al producto.

## Matriz de capacidades

“Implementación observada” significa que se ha leído el código indicado, no que funcione en esta instalación.

| Necesidad Gabi | Evidencia fijada a versión | Cobertura observada | Trabajo antes de reutilizar |
| --- | --- | --- | --- |
| Self-hosting | [Compose](https://github.com/NeoZi12/dispatchseo/blob/fbf28b2ee58bbbd6ee94dbd61e0bb9627bb59a26/docker-compose.yml) | Postgres, migración, PostgREST, app, cron y builder; Caddy opcional | Arranque descartable sin cron/builder, build del commit fijado y registro de imágenes |
| Contexto multi-site | [Contexto MCP](https://github.com/NeoZi12/dispatchseo/blob/fbf28b2ee58bbbd6ee94dbd61e0bb9627bb59a26/src/lib/mcp-context.ts), [Proyectos](https://github.com/NeoZi12/dispatchseo/blob/fbf28b2ee58bbbd6ee94dbd61e0bb9627bb59a26/src/lib/projects.ts) | Bearer resuelto a proyecto y contexto por petición; existe token legacy de instancia | Probar A/B, concurrencia, revocación y fallo de BD; no usar token legacy para tenants |
| Cola e ideas | [Handlers MCP](https://github.com/NeoZi12/dispatchseo/blob/fbf28b2ee58bbbd6ee94dbd61e0bb9627bb59a26/src/app/api/%5Btransport%5D/route.ts), [Orden de cola](https://github.com/NeoZi12/dispatchseo/blob/fbf28b2ee58bbbd6ee94dbd61e0bb9627bb59a26/src/lib/queue.ts) | Proponer, listar, actualizar y reordenar; filtros por proyecto en las operaciones revisadas | Normalizar respuestas variables, deduplicación e idempotencia |
| Aprobación humana | [update_suggestion / propose_suggestion](https://github.com/NeoZi12/dispatchseo/blob/fbf28b2ee58bbbd6ee94dbd61e0bb9627bb59a26/src/app/api/%5Btransport%5D/route.ts) | El cliente puede declarar owner o manual; la cola aplica reglas según esos argumentos | Gabi debe acreditar actor/aprobación fuera del modelo; no exponer estas escrituras directamente |
| Search Console | [Cliente GSC](https://github.com/NeoZi12/dispatchseo/blob/fbf28b2ee58bbbd6ee94dbd61e0bb9627bb59a26/src/lib/gsc.ts), [get_site_stats](https://github.com/NeoZi12/dispatchseo/blob/fbf28b2ee58bbbd6ee94dbd61e0bb9627bb59a26/src/app/api/%5Btransport%5D/route.ts) | Snapshots y consultas; servicio de instancia en self-hosting; OAuth condicionado a cloud en el selector revisado | No asumir OAuth self-hosted. Resolver aislamiento de credenciales y propiedad antes del piloto |
| Keywords, rankings y páginas | [Herramientas registradas](https://github.com/NeoZi12/dispatchseo/blob/fbf28b2ee58bbbd6ee94dbd61e0bb9627bb59a26/src/app/api/%5Btransport%5D/route.ts) | track_keywords, get_rankings, get_pages, check_serp, keyword_ideas y suggest_keywords | Separar lectura almacenada de consultas externas que consumen cuota |
| Backlinks y tendencias | [Herramientas registradas](https://github.com/NeoZi12/dispatchseo/blob/fbf28b2ee58bbbd6ee94dbd61e0bb9627bb59a26/src/app/api/%5Btransport%5D/route.ts) | Prospectos, estados, temas y disparadores de tendencias | No equiparar prospectos con adquisición automática de enlaces; disparadores deshabilitados al inicio |
| Programación y ejecuciones | [Jobs](https://github.com/NeoZi12/dispatchseo/blob/fbf28b2ee58bbbd6ee94dbd61e0bb9627bb59a26/src/lib/jobs.ts), [get_automations / get_cron_health](https://github.com/NeoZi12/dispatchseo/blob/fbf28b2ee58bbbd6ee94dbd61e0bb9627bb59a26/src/app/api/%5Btransport%5D/route.ts) | Jobs crawl/finish/publish/verify; reintentos acotados; lecturas de salud y evidencia | No se identificó una API MCP genérica de Run; diseñar adaptación sin acceso compartido a tablas |
| Publicación GitHub | [update_suggestion / merge_pr](https://github.com/NeoZi12/dispatchseo/blob/fbf28b2ee58bbbd6ee94dbd61e0bb9627bb59a26/src/app/api/%5Btransport%5D/route.ts), [mergePr](https://github.com/NeoZi12/dispatchseo/blob/fbf28b2ee58bbbd6ee94dbd61e0bb9627bb59a26/src/lib/github.ts) | Estado done al abrir PR; mergePr solicita squash a GitHub | Separar PR abierto de publicación; checks, SHA y aprobación deben verificarse explícitamente; merge deshabilitado |
| Borradores y destinos | [submit_article / approve_draft](https://github.com/NeoZi12/dispatchseo/blob/fbf28b2ee58bbbd6ee94dbd61e0bb9627bb59a26/src/app/api/%5Btransport%5D/route.ts) | Entrega de artículos y adelanto de publicación, con rutas repo/WordPress | No tratar approve_draft como simple aprobación de idea; excluir esta vía del primer adaptador |
| GEO | [Snapshots IA](https://github.com/NeoZi12/dispatchseo/blob/fbf28b2ee58bbbd6ee94dbd61e0bb9627bb59a26/src/lib/ai-visibility.ts), [get_ai_visibility / record_ai_citations](https://github.com/NeoZi12/dispatchseo/blob/fbf28b2ee58bbbd6ee94dbd61e0bb9627bb59a26/src/app/api/%5Btransport%5D/route.ts) | Persistencia y consulta de observaciones/citas por proyecto | Validar procedencia y frescura; la existencia del esquema no acredita exactitud de respuestas IA |
| SEO técnico | [rescan_site / get_site_digest / check_sameness](https://github.com/NeoZi12/dispatchseo/blob/fbf28b2ee58bbbd6ee94dbd61e0bb9627bb59a26/src/app/api/%5Btransport%5D/route.ts) | Superficie de crawl, digest y similitud | Cobertura parcial; no acredita una auditoría integral de robots, canonicals, schema y rendimiento |
| SEO local, GBP y reseñas | Inventario MCP y árbol completo de archivos | No se identificó una integración dedicada en las superficies revisadas | Carencia candidata, no demostración exhaustiva de ausencia; evaluar otros upstreams en la tanda local |
| Conversiones y leads | Inventario MCP y árbol completo de archivos | No se identificó contrato dedicado de objetivos/leads | No confundir analítica del producto con analítica de conversiones del sitio |
| Secretos | [Cifrado](https://github.com/NeoZi12/dispatchseo/blob/fbf28b2ee58bbbd6ee94dbd61e0bb9627bb59a26/src/lib/crypto.ts), [Guardas](https://github.com/NeoZi12/dispatchseo/blob/fbf28b2ee58bbbd6ee94dbd61e0bb9627bb59a26/src/lib/tenant-guard.ts) | AES-GCM, compatibilidad con texto legacy y opción de clave en la misma BD; self-hosting asume propietario único en estas guardas | Definir threat model de Gabi; multi-site no equivale a aislamiento entre propietarios |

## Diferencias que condicionan la adopción

1. **Aprobación declarada por cliente.** update_suggestion toma decided_by=owner como señal suficiente para omitir la coerción a pending. propose_suggestion acepta source=manual junto con approved=true. Es un contrato de confianza del upstream, insuficiente por sí solo para un agente autónomo sujeto a la política Gabi.
2. **Aprobar puede iniciar trabajo.** La aprobación owner de una idea de tipo tool puede disparar el builder. No debe modelarse como escritura inocua ni reintentarse a ciegas.
3. **Done no significa publicado.** La descripción y el handler admiten done con result_pr_url al abrir PR. Gabi necesita Publication independiente y evidencia posterior del merge.
4. **Merge no verifica todo el contrato de Gabi.** La función revisada envía la solicitud a GitHub sin comprobación propia de checks ni SHA esperado. La protección que aplique GitHub depende del repositorio. No habilitar merge_pr en el adaptador inicial.
5. **La seguridad self-hosted difiere de cloud.** assertProjectOwned retorna sin restricción de propietario en self-hosting. GSC usa una cuenta de servicio compartida y GitHub puede recurrir a un token de instancia. Los filtros por project_id no prueban separación de credenciales.
6. **El modo chat no es un permiso.** ?client=chat reduce herramientas y cambia respuestas; el cliente puede quitarlo. Algunas lecturas también pueden provocar probes externos y ese modo registra actividad.
7. **Un commit no fija las imágenes.** Compose referencia latest para app/builder. Una prueba reproducible debe construir la revisión seleccionada o fijar digest y comprobar correspondencia. No ejecutar start.sh sin preparar el aislamiento del ensayo.

## Siguiente comprobación

Ejecutar el [plan de contratos y ensayo](dispatchseo-contract-plan.md) con dos sitios sintéticos. El comando Docker no está disponible en PATH en el entorno inspeccionado; no se ha comprobado un daemon alternativo. La prueba de despliegue sigue pendiente. La preparación documental puede continuar sin instalar dependencias ni crear credenciales.

No se añade un ADR de adopción aceptado: hacerlo antes de las pruebas convertiría una preferencia documentada en una conclusión no demostrada.
