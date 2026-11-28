# Roadmap

El roadmap describe resultados verificables, no fechas comprometidas. Cada tanda debe terminar con documentación, pruebas y una decisión de continuar o descartar.

## Tanda 0 — Bootstrap arquitectónico (completa)

- [x] Inspeccionar repositorio, rama, historial, archivos, remoto y configuración.
- [x] Verificar DispatchSEO contra repositorio y documentación primaria.
- [x] Definir límites entre upstream, Gabi, integraciones e INIMA.
- [x] Documentar arquitectura, decisiones, reglas y licencia.
- [x] No añadir código, dependencias, credenciales, conexiones ni despliegue.

## Tanda 1 — Spikes de reutilización y contratos

- [x] Crear una matriz de capacidades Gabi ↔ DispatchSEO con versión y evidencia por capacidad: [evaluación estática](docs/spikes/dispatchseo-evaluation.md), commit `fbf28b2` (2026-09-08). No acredita ejecución ni compatibilidad.
- [x] Probar en un entorno descartable el despliegue self-hosted de DispatchSEO sin conectar cuentas reales: [ensayo Docker del 2026-09-09](docs/spikes/dispatchseo-lab-report.md), con cron y builders excluidos.
- [ ] Inventariar contratos MCP/API necesarios y comprobar aislamiento multi-site.
  - Esquemas reales capturados: 73 herramientas agente y 19 chat. Lecturas, concurrencia y escrituras cruzadas de ideas ensayadas; aislamiento de credenciales, fallbacks y otros casos del [plan](docs/spikes/dispatchseo-contract-plan.md) todavía pendientes.
  - [C06/C13 caracterizados con fallos y proveedores simulados](docs/spikes/dispatchseo-fault-report.md): tres diferencias respecto a los requisitos Gabi. ADR-011 fija restricciones; pruebas completas de la fachada y credenciales aún pendientes.
- [x] Decidir modalidad para el prototipo: servicio sin modificar detrás de fachada de lectura, ADR-013. Escrituras y producción pendientes.
- [x] Definir contratos `Site`, `Idea`, `Approval`, `Run`, `Evidence` y eventos versionados: [v1.0.0](contracts/README.md), con 55 comprobaciones de formato/entrada. Políticas de servicio pendientes de implementar.
- [x] Especificar threat model, retención, cifrado y almacén de secretos: [modelo](docs/security/THREAT_MODEL.md). Backend de secretos y comprobación de controles pendientes.
- [x] Seleccionar stack delgada y justificadamente: [Node.js/TypeScript, Fastify y Ajv](docs/spikes/prototype-stack.md). Dependencias fijadas e instaladas; SDK MCP 1.30.0 ensayado con las tres lecturas acotadas.
- [x] Implementar primer corte de lectura sintética y pruebas de políticas descritas en ADR-013: [prototipo](docs/LOCAL_PROTOTYPE.md), 12 pruebas correctas.
- [x] Conectar adaptador MCP al laboratorio y probar aislamiento en la frontera Gabi↔DispatchSEO: [9 escenarios integrados](docs/spikes/gabi-dispatch-report.md). Red privada de producción y credenciales reales pendientes.

Salida: ADR de adopción, prototipo sin secretos, pruebas de contrato y estructura mínima de módulos.

## Tanda 2 — Núcleo y piloto sin publicación

- [ ] Registro multi-site y ubicaciones con aislamiento probado.
- [ ] Cola/tareas, aprobación humana, auditoría e idempotencia.
- [ ] Fachada MCP mínima con lectura de proyecto y gestión de cola.
  - [x] Lecturas locales de sitio, ideas y evidencia mediante [MCP Gabi](docs/MCP_LOCAL.md), con siete grupos de pruebas nuevos y cuatro escenarios contra DispatchSEO real. Escrituras de cola y autenticación operativa siguen pendientes.
- [ ] Conectar Search Console del piloto con consentimiento explícito y permisos mínimos.
  - [x] Ruta local de lectura manual preparada: instancia aislada, validación de propiedad/configuración, proyección normalizada y pruebas de fallo cerrado. Falta la primera verificación con las credenciales locales del piloto.
- [ ] Sincronizar métricas de solo lectura, procedencia y frescura.
- [ ] Dashboard mínimo de salud y próximos pasos.
  - [x] [Panel local con sitios sintéticos](docs/DASHBOARD_LOCAL.md): resumen, ideas, detalle de evidencias y estados de carga/error. Pantalla de salud del piloto y conexión a datos reales pendientes.

Salida: Pinturas Gabriel Ferrol visible en modo lectura; ninguna modificación en Google o GitHub.

## Tanda 3 — SEO técnico y publicación segura

- [ ] Auditoría técnica reproducible y deduplicación de hallazgos.
- [ ] Integración GitHub con rama/PR, preview y checks.
- [ ] Flujo idea → aprobación → PR → registro posterior al merge.
- [ ] Política de mínimo privilegio y separación entre código no confiable y credenciales de escritura.
- [ ] Merge manual por defecto; automerge todavía desactivado.

Salida: primer PR de prueba revisable, sin despliegue automático desde Gabi.

## Tanda 4 — SEO local y reputación

- [ ] Modelo de ubicaciones, NAP, páginas locales y citaciones.
- [ ] Spike de Google Business Profile y revisión de términos/cuotas.
- [ ] Ingesta de ficha, métricas y reseñas.
- [ ] Borradores de respuesta a reseñas con aprobación obligatoria.
- [ ] Señales locales en cola y reporting.

Salida: panel local del piloto y respuesta simulada; publicación real solo tras aprobación específica.

## Tanda 5 — Conversiones y leads

- [ ] Objetivos y esquema de eventos independiente del proveedor.
- [ ] Adaptador analítico con consentimiento y minimización.
- [ ] Referencias de lead sin copiar PII innecesaria al núcleo SEO.
- [ ] Informes de landing/query/objetivo con advertencias de atribución.

Salida: embudo verificable con datos sintéticos antes de conectar producción.

## Tanda 6 — GEO y automatización gradual

- [ ] Reutilizar o adaptar snapshots de visibilidad IA del motor seleccionado.
- [x] Proyectar el inventario leído de ZeroRank a evidencia y propuestas de borrador pendientes; el escritor sigue fuera hasta verificar su API y conservar la aprobación humana.
- [x] Añadir una entrada trazable para preguntas procedentes de proveedores o exportaciones autorizadas; la selección del proveedor y cualquier cuota siguen pendientes. Véase [investigación de preguntas](docs/QUESTION_RESEARCH.md).
- [ ] Comparar motores, citas y competidores con procedencia.
- [ ] Presupuestos, cuotas, alertas y kill switches.
- [ ] Habilitar automatizaciones por sitio de forma gradual.
- [ ] Evaluar automerge solo tras historial de ejecuciones y checks fiables.

## Tanda 7 — Puente externo con INIMA

- [ ] Definir caso de uso mínimo y contrato público versionado.
- [ ] Revisar límites de licencia con asesoramiento adecuado.
- [ ] Implementar `inima-bridge` fuera del núcleo propietario de INIMA.
- [ ] Pruebas de desconexión, compatibilidad y ausencia de dependencias internas.

## Trabajo transversal

- Documentación de operación, backup, restauración y actualización.
- SBOM, escaneo de secretos/dependencias y proceso de divulgación.
- Accesibilidad, internacionalización y zonas horarias.
- Métricas de coste, cuota, calidad y fallos visibles.
- Casos de prueba reales para Claude Code, Codex, Cursor y un cliente MCP genérico.

## Backlog de producto INIMA SEO — RRSS e internacionalización (28/11/2026)

Requisitos de negocio para una fase posterior, sin reordenar el trabajo actual ni autorizar integraciones, gasto o publicación en producción. Fuente editorial: [inima-marketing, decisiones D-082 a D-085](https://github.com/mprietob/inima-marketing/blob/main/DECISIONES.md). Mi INIMA sigue siendo un sistema externo.

- [ ] Gestión de contenido por cuenta e idioma: investigación de temas, guiones, revisión médica, producción/edición, traducción y publicación con políticas aprobadas, registro y límites de coste. Diferenciar marca personal, clínicas y Rebeldía Médica.
- [ ] Ciclo recurrente de Trial Reels: reutilizar piezas ganadoras, probar variantes y versiones completas en inglés, medir distribución geográfica y conversión. Verificar capacidades reales de Instagram/API, reglas y cuotas; mantener paso manual si no hay mecanismo autorizado. No prometer automatización inexistente.
- [ ] Atribución por reel/campaña/idioma: enlazar visitas → tests → compras de contenido → teleconsultas, con eventos minimizados, sin datos clínicos ni identificativos en SEO; contrato externo versionado y métricas de ingresos/coste con límites de atribución.
- [ ] Evaluar HeyGen u otros proveedores intercambiables para doblaje y avatares de médicos voluntarios de la cuenta de clínicas; revisar naturalidad, consentimiento, identificación de contenido sintético, coste y calidad médica. No contratar ni generar clones masivamente hasta validar la prueba. Uso del láser con avatares pendiente de decisión.
- [ ] Objetivo de automatización operativa dentro de reglas autorizadas, con excepciones para revisión humana (en particular validación médica y publicidad sanitaria). No elimina las políticas de aprobación vigentes de este repo; cualquier ampliación de permisos debe diseñarse y verificarse expresamente.
