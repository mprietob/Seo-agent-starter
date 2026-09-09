# Contratos Gabi 1.0.0

Estado: especificación del 2026-09-09; no existe todavía un servicio que aplique estas políticas. [schema.json](v1/schema.json) usa JSON Schema 2020-12. Los ejemplos son sintéticos e independientes, no una base de datos coherente. La elección de stack y de modalidad de adopción de DispatchSEO sigue pendiente.

## Validación reproducible

Con Python disponible, desde la raíz del repositorio:

```powershell
python -m pip install --target .tools/contracts -r contracts/requirements-dev.txt
python contracts/check.py
```

Se reutiliza jsonschema únicamente como herramienta de desarrollo, con versiones fijadas. La instalación requiere acceso al registro; la comprobación posterior es offline, rechaza referencias externas y exige validadores de UUID, fecha y hostname. No añade dependencias al producto. Resultado inicial: 55 comprobaciones de ejemplos, entradas y casos inválidos, además de la autovalidación del esquema.

## Frontera de entrada

El esquema raíz reúne registros de salida y comandos. **Un endpoint debe validar específicamente `#/$defs/Command`, nunca aceptar la unión raíz como entrada.** Approval, Event, Run y Error son registros producidos por el servidor. Que un objeto cumpla el esquema no acredita identidad ni permiso.

La autenticación proporciona actor, sitio y concesiones verificadas fuera del cuerpo. El cliente no puede elegir site_id, conexión, token ni endpoint. Una sesión con varios sitios selecciona un contexto autorizado antes de ejecutar; el servidor vuelve a comprobar la pertenencia en cada operación y en el worker. Todas las referencias se resuelven dentro del sitio autenticado, incluidas evidencias, repositorios y cursores. Los cursores deben estar ligados al sitio, consulta y caducidad, sin exponer claves internas.

| Comando | Semántica prevista | Habilitación |
| --- | --- | --- |
| site.read | Metadatos permitidos del sitio autenticado | Primer prototipo, tras probar permisos |
| ideas.list | Cola del sitio, límite máximo 100 | Primer prototipo, tras probar permisos |
| evidence.read | Evidencia normalizada del sitio | Primer prototipo, tras probar permisos |
| idea.propose | Crear propuesta pending con clave de idempotencia | Desactivado hasta implementar cola y auditoría |

Ninguna capacidad está desplegada actualmente. No hay comando para aprobar, cambiar recursos externos, publicar o hacer merge. Las aprobaciones y los eventos de publicación reservan vocabulario para hitos posteriores; su presencia en el esquema no habilita esas acciones. Las políticas serán comunes a dashboard, MCP y workers.

## Invariantes del servicio

- Site: dominio normalizado y zona horaria IANA válida; un sitio suspendido bloquea nuevas operaciones. El esquema solo comprueba la forma de la zona horaria.
- Idea: propuesta nueva en pending. Un humano autorizado puede aprobar o rechazar; una aprobación vigente permite pasar a in_progress y después pr_open con evidencia del PR. La cancelación se audita. Cambiar el contenido incrementa revision e invalida aprobaciones previas. pr_open nunca significa publicado. No habrá transición a producción por una declaración del agente.
- Approval: registro inmutable generado tras autenticar a una persona con permiso de aprobación. Vincula sitio, acción y revisión exacta del objetivo. Caducidad inicial máxima: 24 horas; expires_at debe ser posterior a decided_at. Revocación y consumo se registran en auditoría. Antes de actuar, el servicio comprueba revisión, vigencia, revocación y permiso actual; un JSON con actor_type human no basta.
- Run: reservar atómicamente la clave por sitio, actor y operación junto con el hash del cuerpo normalizado. Misma clave y cuerpo devuelve el resultado existente; un cuerpo distinto produce revision_conflict. El worker comprueba permisos otra vez antes del efecto. Transiciones: queued → running → succeeded/failed/unknown; queued puede cancelarse. unknown requiere conciliación con el proveedor antes de resolverlo. Las fechas respetan el orden causal y succeeded exige resultado verificable, no solo HTTP 200.
- Evidence: procedencia y digest del contenido normalizado son calculados por el adaptador. El servidor calcula freshness según la fuente y el reloj; unknown permite fechas desconocidas en null. No se inventan observaciones ni se presentan inferencias como mediciones. source_ref es una referencia opaca, nunca una URL con credenciales. Un UUID válido no prueba pertenencia y un digest no prueba veracidad.
- Event: generado mediante outbox transaccional con el cambio de estado; identificador único, consumidores idempotentes por sitio/event_id y sin depender del orden de llegada. publication.merged solo podrá emitirse tras verificar repositorio autorizado, PR y commit fusionado con el proveedor. El evento de ejemplo es ficticio; esa integración no existe.

## Errores, reintentos y adaptadores

Error devuelve un código estable y request_id; los detalles internos quedan en logs redactados. not_found_or_forbidden evita revelar recursos de otros sitios. dependency_unavailable no equivale a una credencial inválida y nunca activa permisos alternativos. Un fallo de formato upstream produce invalid_upstream_response. Un efecto remoto incierto produce outcome_unknown y retry_hint reconcile: no reenviar la escritura automáticamente.

Lecturas transitorias: máximo tres intentos dentro de un presupuesto total de 30 segundos, con esperas de 1 y 2 segundos más jitter, respetando Retry-After solo si cabe en el presupuesto. Los límites son requisitos del futuro adaptador. La idempotencia local por sí sola no garantiza un único efecto remoto: tras un timeout hay que consultar el identificador remoto o mantener unknown.

DispatchSEO se mantiene detrás de un adaptador. La traducción de IDs, estados y errores es explícita; no se exponen herramientas por prefijo get_/check_. Algunas lecturas upstream actualizan actividad. El inventario y los ensayos no son una allowlist de producción. El adaptador reconoce isError y texto no JSON, limita tamaños y normaliza antes de emitir un contrato Gabi. No hereda auto_approve, merge_enabled ni la identidad declarada por el cliente.

## Versionado y pruebas pendientes

schema_version es exacta. Un consumidor rechaza versiones desconocidas. Los objetos cerrados implican que añadir campos también exige negociar una nueva versión: no se presupone compatibilidad por ser un cambio menor. Mantener ejemplos por versión y probar migraciones explícitas; no reinterpretar eventos históricos silenciosamente.

Los 55 checks solo cubren estructura. El prototipo deberá demostrar aislamiento A/B en cada referencia, revocación entre encolado y ejecución, aprobación vencida o con revisión antigua, dos workers con la misma clave, timeout después del efecto remoto, entrega duplicada de eventos, caída de BD sin fallback y ausencia de secretos en respuestas/logs. Véase el [modelo de amenazas](../docs/security/THREAT_MODEL.md).
