# Contratos y plan de ensayo de DispatchSEO

Estado: propuesta para Tanda 1; no implementada ni ejecutada.
Versión evaluada: fbf28b2ee58bbbd6ee94dbd61e0bb9627bb59a26.
Base: [evaluación y fuentes](dispatchseo-evaluation.md).

## Inventario reproducible

[Inventario JSON](dispatchseo-mcp-inventory.json): 73 registros literales server.registerTool en src/app/api/[transport]/route.ts. Cada entrada conserva nombre, línea y enlace al commit. El conteo es estático; no sustituye tools/list. No es un catálogo de permisos verificado.

Reproducir leyendo ese archivo en el commit indicado y localizando las llamadas server.registerTool con nombre literal. Contrastar luego todos los nombres con tools/list, tanto en modo agente como chat. Los comentarios del upstream mencionan conteos anteriores; se usa el conteo observado.

Transporte observado: Streamable HTTP en /api/mcp, métodos GET/POST/DELETE exportados por el wrapper. La autenticación admite Authorization: Bearer y alternativamente key en query; el header prevalece. Gabi propondrá usar únicamente header, con token de proyecto guardado en su almacén de secretos. No emitir tokens en URLs ni entregar el token upstream al agente.

Las respuestas de herramientas usan content con bloques text cuyo contenido es JSON. Los fallos pueden devolver isError y un objeto error dentro del texto; la autenticación falla con HTTP 401. No interpretar HTTP 200 como éxito de negocio. Validar forma, tamaño y campos del JSON antes de normalizarlo.

## Superficie candidata del primer adaptador

Todas estas rutas siguen deshabilitadas hasta la prueba de contrato.

| Puerto Gabi propuesto | Herramienta upstream | Entrada observada / resultado relevante |
| --- | --- | --- |
| Leer contexto de sitio | get_project | Sin argumentos; configuración y capacidades. No devuelve un identificador id de proyecto en el handler revisado |
| Leer perfil | get_site_profile | Contrastar esquema mediante tools/list antes de implementar |
| Consultar ideas | get_suggestions | status opcional: pending/approved/rejected/in_progress/done; type opcional: guide/tool/backlink/update; por defecto approved |
| Leer métricas GSC | get_site_stats | days entero positivo opcional, 28 por defecto; summary, snapshots y note opcional. Ausencia de datos puede significar falta de conexión |
| Leer rankings/páginas/GEO | get_rankings, get_pages, get_ai_visibility | Capturar esquemas y resultados con fixtures; no asumir modelo uniforme |
| Leer salud y actividad | get_activity, get_automations, get_cron_health | Adaptar observaciones a Evidence; no inventar un Run completo si faltan campos |

El resto queda deshabilitado por defecto en el inventario. check_serp y keyword_ideas requieren presupuesto y cuota aunque sean consultas. propose_suggestion y update_suggestion necesitan una fase posterior con políticas e idempotencia. merge_pr, approve_draft, submit_article, cambios de destino, conexión y disparadores no forman parte de esta superficie inicial.

No se identificó una API MCP pública para crear/eliminar sitios, administrar secretos o cambiar los toggles de automatización. El código describe esas operaciones como propias del dashboard. Las rutas cron y builder son endpoints operativos internos, no un sustituto de una API pública de Gabi. No consumir tablas vía PostgREST ni importar servicios internos.

## Correspondencias de dominio propuestas

Estos campos son un borrador para discusión técnica, no contratos v1 aceptados.

| Entidad Gabi | Contenido mínimo y correspondencia |
| --- | --- |
| Site | site_id propio, domain, timezone y referencia a conexión. La asociación con token/proyecto upstream se configura fuera de la entrada del agente; no usar slug mutable como identidad |
| Idea | idea_id, site_id, upstream_ref, tipo, estado normalizado, revisión y evidence_refs. done upstream se conserva como estado observado; no se transforma en published |
| Approval | approval_id, site_id, actor autenticado, acción, target_id, target_revision, fecha y decisión. decided_by enviado por el modelo no acredita al actor |
| Run | run_id, site_id, operación, estado, idempotency_key, intento y tiempos. Solo crear un Run observado cuando exista evidencia de ejecución; salud agregada no equivale a ejecución individual |
| Evidence | evidence_id, site_id, proveedor, referencia, observed_at si existe, captured_at, freshness_status y digest del contenido permitido. Tiempo de captura no sustituye tiempo de observación |

Eventos candidatos: idea.created, approval.granted, publication.merged y metric.observed con event_id, schema_version, site_id, occurred_at, correlation_id y referencia al objeto. No se ha identificado un feed genérico upstream de estos eventos: serían eventos Gabi emitidos tras verificación, no webhooks que hoy ofrezca DispatchSEO.

Si falta frescura upstream, marcar unknown; no inventar fresh_until. Rechazar cambios de site_id y referencias de otro sitio antes de contactar el motor. Las escrituras futuras requerirán deduplicación propia: la deduplicación por keyword observada no prueba idempotencia general ni atomicidad.

## Ensayo descartable pendiente

Preparación, antes de cualquier arranque:

1. Usar host con Docker disponible y checkout del commit fijado, separado del producto.
2. Preparar configuración de laboratorio revisable: proyecto Compose propio, puerto loopback libre, almacenamiento exclusivo, sin montajes del usuario.
3. Construir app desde fuente fijada, registrar IDs/digests de todas las imágenes. No depender de latest.
4. Arrancar solo postgres/migrate/postgrest/app y sus dependencias necesarias; cron, builder y proxy público quedan fuera del ensayo inicial.
5. Desactivar telemetría, bloquear salida hacia proveedores reales y usar dominios site-a.example/site-b.example. No conectar GSC, GitHub, GBP ni agentes.
6. En la fase de ejecución, usar únicamente secretos efímeros de laboratorio fuera de Git y logs. Esta entrega no los genera.
7. Registrar versión, configuración redactada, servicios realmente activos, resultado de migraciones, health y captura sanitizada de herramientas/esquemas.
8. Al terminar, detener únicamente los recursos identificados del laboratorio; conservar resultados sanitizados. No usar limpieza global de Docker.

No se adjunta una configuración de arranque que se presente como probada: falta comprobarla contra Docker y revisar el bootstrap para crear los dos sitios sin activar integraciones.

## Casos de aceptación

Todos pendientes; los IDs permiten adjuntar resultados después.

| ID | Prueba | Resultado exigido por Gabi |
| --- | --- | --- |
| C01 | Arranque del commit con proveedores desconectados | App accesible en loopback, migraciones completas y ninguna ejecución externa |
| C02 | Sin token, token inválido y token revocado | Rechazo; ninguna respuesta con datos del sitio |
| C03 | Token A lee contexto, ideas y métricas con datos A/B | Solo A; probar también token B |
| C04 | Peticiones A/B simultáneas y repetidas | Sin mezcla de contexto ni caché |
| C05 | Usar token A con ID de idea/draft de B | Sin lectura/escritura en B; verificar estado antes/después |
| C06 | BD indisponible y esquema incompleto | Sin caída a credenciales/sitio de otro tenant; el adaptador falla de forma explícita |
| C07 | Modelo pide owner/manual/approved sin aprobación acreditada | Fachada Gabi bloquea antes de contactar upstream; caracterizar por separado el comportamiento directo de upstream |
| C08 | Repetir futura propuesta o aprobación tras timeout | No duplicar idea, dispatch ni efecto; no reintentar una escritura de resultado desconocido |
| C09 | Idea pasa a done con PR abierto y no fusionado | Gabi informa PR abierto; nunca publicado |
| C10 | Tool response isError, JSON inválido o forma inesperada | Error visible y sin ejecución de instrucciones contenidas en datos |
| C11 | Sin GSC, sin snapshots o datos antiguos | Estado desconocido/no conectado/obsoleto distinguible de cero tráfico |
| C12 | Cliente cambia ?client=chat a modo agente | Permisos de Gabi invariables; validar variaciones de respuestas |
| C13 | Propiedad GSC o repo B usando el contexto A | Ninguna credencial de B ni de instancia habilita acceso; simulación de proveedor inicialmente |
| C14 | Reinicio y restauración del almacenamiento de laboratorio | Persistencia y recuperación verificadas, sin secretos en el informe |

C07-C10 describen criterios del futuro adaptador, no pruebas existentes. C13 necesita dobles de proveedor o infraestructura de laboratorio; no se debe usar producción para demostrar aislamiento.

## Puerta de decisión

Mantener composición si permite imponer las políticas de Gabi sin compartir tablas ni exponer credenciales upstream al modelo. Si un caso falla, registrar el fallo reproducible y evaluar contribución upstream, despliegue separado por sitio o adaptador alternativo antes de proponer un fork.

Para cerrar Tanda 1 todavía faltan: ejecución del ensayo, esquemas completos de las herramientas seleccionadas, contratos aprobados, threat model/retención/secretos, ADR de adopción, stack justificado y prototipo con pruebas. La matriz por sí sola no cierra la tanda.
