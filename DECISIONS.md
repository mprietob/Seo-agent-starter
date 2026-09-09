# Registro de decisiones

Las decisiones aceptadas pueden cambiar mediante una entrada posterior; no se reescribe su historia.

## ADR-001 — Licencia AGPL-3.0-only

- Estado: aceptada
- Fecha: 2026-09-04

Gabi SEO será un servicio open-source y self-hosted, y DispatchSEO —principal candidato de reutilización— usa AGPL-3.0. Adoptamos GNU AGPL v3 para el código propio de Gabi, sin cláusula “or later”, para asegurar disponibilidad del código de versiones modificadas ofrecidas por red y evitar incompatibilidades si más adelante se incorpora legítimamente código AGPL compatible.

Esta decisión no relicencia DispatchSEO, agentes, SDKs, servicios externos ni INIMA. Cada componente conserva sus términos. No sustituye asesoramiento jurídico.

## ADR-002 — Composición antes que copia o fork

- Estado: aceptada como dirección; adopción técnica pendiente
- Fecha: 2026-09-04

Se prioriza ejecutar DispatchSEO sin modificar y consumir contratos MCP/API. Solo se considerará un fork cuando un spike demuestre que la extensión externa no cubre una necesidad crítica. Esta tanda no copia código upstream.

Consecuencia: se necesita una capa anticorrupción y pruebas de contrato, pero se reduce el acoplamiento a internals y el coste de actualización.

## ADR-003 — Cuatro ámbitos explícitos

- Estado: aceptada
- Fecha: 2026-09-04

La arquitectura separa `upstream`, `gabi`, `integrations` e `inima-bridge`. No comparten tablas ni importan módulos internos entre límites. La comunicación cruza puertos, DTOs y eventos versionados.

## ADR-004 — Monolito modular para el inicio

- Estado: aceptada
- Fecha: 2026-09-04

El código propio empezará como monolito modular más worker, base relacional y almacén de secretos abstracto. No se crean microservicios hasta que aislamiento, escalado o ciclo de despliegue lo justifiquen.

DispatchSEO, si se adopta, seguirá siendo un proceso/servicio separado.

## ADR-005 — Multi-site como invariante

- Estado: aceptada
- Fecha: 2026-09-04

Todas las entidades operativas y rutas de ejecución se acotan por `site_id`. La identidad MCP se resuelve a un sitio antes de ejecutar casos de uso. Workers, cachés, búsquedas, auditoría y secretos deben respetar el mismo límite.

## ADR-006 — Servicios compartidos por dashboard, MCP y automatización

- Estado: aceptada
- Fecha: 2026-09-04

Las tres entradas llaman a los mismos casos de uso y políticas. Ningún canal obtiene atajos de autorización. Las diferencias de presentación o transporte quedan en adaptadores.

## ADR-007 — Aprobación y publicación segura por defecto

- Estado: aceptada
- Fecha: 2026-09-04

Ideas y cambios públicos requieren aprobación humana por defecto. La publicación produce una pull request, nunca un push directo a la rama principal. Respuestas a reseñas y cambios en Google Business Profile requieren aprobación explícita en el MVP. El automerge futuro será opt-in y condicionado a checks.

## ADR-008 — Credenciales propias y adaptadores reemplazables

- Estado: aceptada
- Fecha: 2026-09-04

Cada instalación aporta sus cuentas y claves. El núcleo conserva referencias cifradas, no valores en configuración versionada. Los SDKs de Google, GitHub, agentes y datos SEO quedan detrás de interfaces para evitar que un proveedor defina el dominio.

## ADR-009 — INIMA permanece externa

- Estado: aceptada
- Fecha: 2026-09-04

INIMA no será un módulo, workspace ni dependencia de Gabi SEO. Una conexión futura será opcional, autenticada, versionada y desplegable por separado. No habrá copia bidireccional de código ni acceso directo a bases de datos.

## ADR-010 — Métricas con procedencia y prudencia causal

- Estado: aceptada
- Fecha: 2026-09-04

Search Console, GBP, analítica, leads y GEO producen observaciones con fuente, sitio, instante y frescura. La interfaz distinguirá datos observados, inferencias y recomendaciones. La atribución de conversiones no se presentará como causalidad demostrada.

## ADR-011 — Condiciones de aislamiento para adoptar el motor

- Estado: aceptada como restricción de diseño; implementación y adopción técnica pendientes
- Fecha: 2026-09-09

El [ensayo de fallos y proveedores simulados](docs/spikes/dispatchseo-fault-report.md) confirma que la separación de filas por proyecto en DispatchSEO self-hosted no limita por sí sola los recursos alcanzables con credenciales de instancia. También caracteriza el fallback legacy a flags automáticos durante un fallo de BD. Esto no cambia ADR-002: composición sigue siendo la primera opción a evaluar.

Para Gabi, los agentes generales no recibirán tokens directos del motor. La identidad autenticada de Gabi determinará site_id y la conexión upstream; las herramientas no podrán elegir otra conexión ni declarar por sí mismas una aprobación humana. Los recursos GSC/GitHub deberán estar fijados por conexión y los permisos externos limitados al sitio. MCP_API_KEY legacy permanecerá ausente en las instancias usadas por Gabi. Fallos de dependencias no ampliarán permisos ni convertirán estados desconocidos en aprobaciones.

El primer contrato tendrá una lista explícita de capacidades; no usará nombres get_/check_ como garantía de ausencia de efectos. Cambios de propiedad/repositorio, publicación y merge estarán excluidos hasta tener políticas autenticadas y pruebas de contrato.

Una instancia por sitio con credenciales restringidas es una alternativa a evaluar; no basta separarla si conserva permisos externos amplios. Una instancia compartida necesitaría controles que impidan saltarse la fachada. No se selecciona todavía ninguna de las dos topologías ni el stack del producto.

## ADR-012 — Contratos cerrados y contexto autenticado

- Estado: aceptada como especificación; implementación pendiente
- Fecha: 2026-09-09

Se fija [v1.0.0](contracts/README.md) como primera base de contratos Gabi, con JSON Schema 2020-12 y ejemplos sintéticos. La entrada valida Command específicamente; los registros Approval/Event no son instrucciones aceptables del cliente. El contexto autenticado fija sitio e identidad. Las versiones desconocidas se rechazan y los efectos inciertos exigen conciliación. Publicación y merge permanecen desactivados.

Se especifican [amenazas, retención y requisitos del almacén de secretos](docs/security/THREAT_MODEL.md), sin elegir backend. Se reutiliza jsonschema con dependencias fijadas y aisladas para comprobar el formato en desarrollo; esto no selecciona Python ni dependencias para la aplicación. Los 55 checks no prueban autorización, aislamiento, idempotencia ni cifrado. Esas pruebas son condición del prototipo antes del piloto.

## Decisiones pendientes de implementación y adopción

1. Modalidad exacta de reutilización y versión fijada de DispatchSEO.
2. Stack de implementación de Gabi tras los spikes, sin asumir Next.js por herencia del upstream.
3. Base de datos, migraciones y almacén de secretos para self-hosting.
4. Contrato y transporte entre Gabi y el motor upstream.
5. Proveedor y alcance de Search Console: OAuth, cuenta de servicio o ambos.
6. Disponibilidad, revisión y límites de Google Business Profile API.
7. Proveedor de analítica/conversiones y política de datos/consentimiento.
8. Especificación pública del puente con INIMA y revisión jurídica correspondiente.
9. Nombre definitivo, identidad del mantenedor y política de contribuciones.
