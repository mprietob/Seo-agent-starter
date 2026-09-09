# Arquitectura inicial

## 1. Objetivo y estado

Actualización 2026-09-09: [ADR-013](DECISIONS.md) selecciona composición con DispatchSEO y Node.js/TypeScript, Fastify y Ajv para el prototipo de lectura. La descripción de capacidades upstream siguiente conserva la revisión histórica; la adopción de escrituras y la implementación de la fachada siguen pendientes. Véase el [corte implementable](docs/spikes/prototype-stack.md).

Gabi SEO coordinará operaciones SEO verificables para varias webs desde una instalación self-hosted. Esta es una arquitectura objetivo, no una descripción de software ya implementado.

El sistema debe poder aprovechar un motor open-source maduro, aportar capacidades diferenciales y exponer el mismo modelo operativo a dashboard, automatizaciones y clientes MCP.

## 2. Evidencia de DispatchSEO

La revisión del repositorio `NeoZi12/dispatchseo` en el commit `89fa4b7` encontró una aplicación Next.js App Router con Postgres/PostgREST para self-hosting o Supabase en cloud, un endpoint MCP sobre HTTP, migraciones SQL, cron y un builder en contenedores. El tenant se resuelve por cookie en dashboard, bearer token en MCP y bucle de proyectos en cron.

### Funcionalidades ya resueltas

- Proyectos multi-site con datos, ajustes y token MCP por proyecto.
- Cola de sugerencias con estados de aprobación, rechazo, prioridad, ejecución y finalización.
- Search Console mediante cuenta de servicio u OAuth, snapshots, consultas y estado de indexación.
- Investigación de keywords, rankings, páginas, backlinks, tendencias y perfil del sitio.
- Programación, salud de cron, alertas y ejecución desatendida.
- Creación y seguimiento de contenido mediante pull requests, controles y modos semi/automático.
- Visibilidad de IA mediante `ai_snapshots` y flujo `geo-scan`.
- Un único conjunto de servicios compartido por dashboard y herramientas MCP.
- Agentes Claude Code, Codex y Cursor registrados; otros clientes MCP pueden conectarse sin builder headless garantizado.

### Componentes potencialmente reutilizables

- Despliegue self-hosted y modelo operativo de estado + reloj + aprobación.
- Contrato MCP y playbooks servidos al agente.
- Modelo multi-tenant por proyecto y patrones de aislamiento.
- Cola, transiciones de estado, planificación e historial de ejecuciones.
- Adaptadores de Search Console, GitHub y proveedores SEO.
- Pipeline de PR, validación, ritmo de publicación y observabilidad.
- Esquema de rankings, páginas, GSC, backlinks, tendencias y visibilidad IA.

La reutilización concreta queda pendiente de un spike técnico y jurídico. Reutilizable no significa copiado: la primera opción es ejecutar upstream como componente independiente y envolverlo con contratos.

### Partes que no conviene reimplementar

No se debe crear desde cero otro servidor MCP SEO, scheduler, cola de aprobación, colector GSC, tracker de rankings o pipeline genérico de pull requests antes de demostrar una carencia concreta. Son superficies amplias, sensibles a cuotas y seguridad, y DispatchSEO ya las mantiene integradas.

### Limitaciones para Gabi SEO

- No se encontró una capacidad de primer nivel para Google Business Profile, gestión de reseñas o SEO local basado en ubicaciones.
- Las analíticas observadas se centran en búsqueda/rankings; no constituyen un modelo de conversiones, leads, atribución y consentimiento.
- La publicación está orientada a repositorios Git, aunque el upstream contiene una incorporación reciente de WordPress que debe evaluarse por separado.
- El núcleo actual es una aplicación integrada; un fork directo aumentaría el coste de actualización y el alcance AGPL.
- MCP conecta clientes genéricos, pero la ejecución headless exige un adaptador verificado por agente.
- Search Console y proveedores externos implican cuotas, consentimiento, retención y credenciales que Gabi deberá gobernar explícitamente.

### Extensión con bajo acoplamiento

- Consumir MCP/API de DispatchSEO como motor externo cuando cubra la capacidad.
- Traducir eventos normalizados (`idea.created`, `approval.granted`, `publication.merged`, `metric.observed`) en una capa anticorrupción.
- Mantener adaptadores propios de SEO local, GBP, reseñas y conversiones fuera del upstream.
- Versionar contratos y usar identificadores opacos, sin compartir tablas ni importar módulos internos.
- Probar contratos contra una versión fijada del upstream y actualizarla deliberadamente.

Fuentes: [arquitectura](https://github.com/NeoZi12/dispatchseo/blob/main/src/content/docs/architecture.mdx), [README](https://github.com/NeoZi12/dispatchseo), [automatizaciones](https://github.com/NeoZi12/dispatchseo/blob/main/src/content/docs/automations.mdx), [publicación](https://github.com/NeoZi12/dispatchseo/blob/main/src/content/docs/publishing.mdx) y [agentes](https://github.com/NeoZi12/dispatchseo/blob/main/docs/AGENTS.md).

## 3. Contextos y límites

```text
Clientes humanos / MCP
          |
          v
   API de Gabi + políticas
     |         |          |
     v         v          v
 motor SEO  integraciones  inima-bridge
 upstream    opcionales     opcional
     \         |          /
      \        v         /
       cola, auditoría y eventos de Gabi
                    |
                    v
             GitHub / pull request
```

### A. Upstream open-source reutilizado

Motor SEO, adquisición de datos, scheduling y publicación que una evaluación confirme que pueden delegarse. Se despliega y versiona por separado. Sus avisos, código fuente y licencia permanecen accesibles conforme a AGPL.

### B. Código propio de Gabi SEO

- Catálogo de sitios, ubicaciones y política por tenant.
- Fachada de capacidades y capa anticorrupción sobre upstreams.
- Cola unificada de ideas/tareas y máquina de estados de aprobación.
- Auditoría, procedencia, consentimientos y políticas de automatización.
- Modelos de SEO local, reseñas, conversiones/leads y correlación de señales.
- Contratos estables para dashboard, MCP y automatizaciones.

### C. Integraciones opcionales

- Google Search Console: rendimiento e inspección; solo lectura al inicio.
- Google Business Profile: ficha, publicaciones, métricas y reseñas, sujeto a disponibilidad y políticas de API.
- GitHub: ramas, PR, checks y merge opcional.
- Analítica/conversiones: adaptadores consentidos para GA4 u otros proveedores y webhooks de leads.
- Proveedores SERP/keywords e IA: módulos sustituibles con presupuesto y cuota por sitio.
- Agentes: Claude Code, Codex, Cursor y clientes MCP compatibles.

Ninguna integración es requisito para arrancar el núcleo. Cada una declara capacidades, permisos, salud y última sincronización.

### D. Conexión externa con INIMA

`inima-bridge` será un adaptador opcional de red. Solo intercambiará DTOs versionados y eventos autorizados; no enlazará bibliotecas, base de datos ni repositorio con INIMA. La instancia de Gabi seguirá funcionando sin él. El propietario de INIMA decidirá su licencia y despliegue por separado.

## 4. Componentes propuestos

| Componente | Responsabilidad |
| --- | --- |
| Capability gateway | Descubrir qué ofrece cada upstream/adaptador y degradar con claridad |
| Site registry | Sitios, ubicaciones, repositorios, zona horaria, idioma y configuración |
| Workflow service | Cola, dependencias, aprobaciones, reintentos e idempotencia |
| Policy engine | Qué puede leer, proponer, publicar o responder cada actor |
| SEO evidence store | Observaciones con fuente, rango temporal, sitio y frescura |
| Technical SEO | Crawl/auditoría, canonicals, robots, sitemap, schema y rendimiento |
| Local SEO | Ubicaciones, NAP, páginas locales, citaciones y cobertura geográfica |
| Reputation | Ingesta de reseñas, borradores de respuesta y aprobación humana |
| Conversion service | Eventos, objetivos, leads, atribución y privacidad |
| GEO service | Consultas, motores, menciones/citas, competidores y snapshots |
| Publishing adapter | Cambios en rama, PR, checks, preview y merge gobernado |
| MCP facade | Herramientas estables que llaman a los mismos servicios de aplicación |
| Scheduler/worker | Trabajos durables con locks, presupuesto, backoff y registro de resultado |
| Audit log | Actor, acción, razón, datos de entrada referenciados y resultado |

## 5. Modelo mínimo

Todas las entidades operativas incluyen `site_id`; las señales además incluyen `source`, `observed_at` y `fresh_until`.

- `Site`, `Location`, `CredentialRef`, `IntegrationConnection`
- `Idea`, `Task`, `Approval`, `AutomationPolicy`, `Run`
- `Keyword`, `Page`, `TechnicalFinding`, `SearchMetric`
- `BusinessProfile`, `Review`, `ReviewReplyDraft`, `LocalCitation`
- `ConversionGoal`, `ConversionEvent`, `LeadRef`
- `AiQuery`, `AiVisibilitySnapshot`, `Citation`
- `Publication`, `PullRequestRef`, `AuditEvent`

Credenciales y datos de lead no se almacenan dentro de objetos de dominio generales. Se referencian desde almacenes especializados y se minimizan.

## 6. Flujos críticos

### Idea a publicación

1. Un colector o agente crea una idea con evidencia y deduplicación.
2. La política decide si queda pendiente, rechazada o autoaprobable.
3. Una aprobación explícita genera una tarea inmutable y auditable.
4. El agente prepara cambios en una rama.
5. El adaptador abre un PR; checks y preview producen evidencia.
6. Una persona hace merge por defecto. El automerge futuro requiere opt-in y políticas verdes.
7. El sistema registra URL, solicita acciones de indexación permitidas y comienza seguimiento.

### Reseñas

La integración ingiere una reseña, el agente propone una respuesta y una persona aprueba antes de publicar. La respuesta automática queda fuera del MVP.

### Conversiones

Los adaptadores reciben eventos minimizados y consentidos. Los informes correlacionan páginas/consultas con objetivos; nunca presentan correlación como causalidad.

## 7. Seguridad y operación

La especificación verificable inicial está en [contratos v1.0.0](contracts/README.md) y el [modelo de amenazas](docs/security/THREAT_MODEL.md). Son requisitos pendientes de implementar, sin selección de stack. Una evidencia con instante de observación o frescura desconocidos conserva null y freshness unknown; no se inventan fechas para completar el registro.

- Aislamiento por tenant también en workers, cachés, búsquedas y logs.
- Tokens con alcance por sitio e integración; rotación y revocación.
- Cifrado en reposo, redacción de logs y referencias a secretos.
- Validación estricta de entradas MCP/web y protección contra SSRF e inyección de prompts.
- Idempotency keys para sincronización, publicación y webhooks.
- Presupuesto, cuota y kill switch por automatización.
- Ningún secreto en PRs de contenido ni en procesos que ejecuten código no confiable.
- Auditoría de publicación, respuestas públicas y cambios de configuración.

## 8. Despliegue inicial sugerido

Un monolito modular y un worker son suficientes para el primer hito. La base de datos relacional y el almacén de secretos se mantienen detrás de puertos. DispatchSEO, si se adopta, corre como servicio separado y fijado a una versión. Extraer servicios adicionales solo cuando exista una necesidad operativa demostrada.

## 9. Criterios de aceptación arquitectónicos

- Una prueba demuestra que credenciales y datos del sitio A no son visibles desde B.
- Dashboard, MCP y cron producen las mismas transiciones autorizadas.
- Desconectar un adaptador no impide gestionar el resto del sitio.
- INIMA puede desaparecer sin romper el arranque ni las migraciones.
- Ninguna publicación alcanza la rama principal sin PR y checks definidos.
- Cada métrica muestra fuente y frescura; cada automatización, su último resultado.
