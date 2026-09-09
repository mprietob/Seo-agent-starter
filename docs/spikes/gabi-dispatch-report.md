# Fachada Gabi → DispatchSEO: primer ensayo integrado

Fecha: 2026-09-09. Upstream sin modificar: `fbf28b2ee58bbbd6ee94dbd61e0bb9627bb59a26`. SDK oficial MCP TypeScript: 1.30.0. [Resultado reproducible](gabi-dispatch-results.json).

## Resultado

Nueve escenarios integrados correctos sobre Docker real, además de 20 pruebas automatizadas del prototipo y adaptadores. La petición entra por HTTP loopback de Gabi, atraviesa autenticación/políticas y llama al MCP del motor con una credencial privada del sitio. El adaptador del producto no consulta tablas. Solo el harness prepara y comprueba fixtures usando PostgREST dentro del contenedor.

| Escenario integrado | Qué demuestra |
| --- | --- |
| Sitio e ideas en ambas direcciones | A y B reciben el proyecto y propuestas de su conexión |
| Captura y lectura de evidencia | 111/222 clics sintéticos separados; evidencia ajena e inexistente devuelven el mismo error |
| Diez peticiones concurrentes | Los contextos no se intercambian en esa muestra |
| Inyección de sitio y propuesta | Rechazo de site_id en Command, escritura y filtro approved |
| Token upstream cruzado | La conexión de A con token de B falla antes de devolver un Site |
| PostgREST detenido y recuperado | 503 de dependencia, sin fallback; recuperación comprobada |
| Revocación upstream | No se confunde fallo del motor con credencial Gabi inválida; B sigue funcionando |
| Revocación Gabi | 401, sin lectura autorizada |
| Estado antes/después | Ideas y configuración de proveedores/automatizaciones sin cambios durante las consultas |

La preparación sí rota tokens de laboratorio, restaura fixtures y sustituye las métricas sintéticas del día. La prueba de revocación rota otro token deliberadamente. La comparación de estado excluye tokens y no afirma que todo campo de actividad interna upstream sea inmutable. No se han conectado proveedores reales, ejecutado cron/builders ni publicado contenido.

## Mapeo explícito

- site.read verifica get_project contra dominio y slug fijados administrativamente y proyecta el nombre. site_id, revisión, zona horaria, estado y alta son metadatos Gabi configurados por el harness. get_project no entrega un project_id; por eso las filas de sugerencias y métricas se comprueban además contra el ID upstream fijado.
- ideas.list llama únicamente a get_suggestions con pending por defecto o rejected explícito. Los estados approved/in_progress/done del motor no acreditan una aprobación Gabi y no se exponen en este corte. Campos permitidos, fechas normalizadas a UTC, sin spec, tokens ni configuración. evidence_refs queda vacío: no se inventa una relación entre una sugerencia y las métricas.
- El operador del laboratorio llama a captureEvidence para consultar get_site_stats con days=1 y guardar una evidencia inmutable en memoria. evidence.read consulta esa captura por ID y sitio, después de la verificación de sitio del servicio. Cada captura obtiene nuevo ID. Solo se conservan resumen numérico, digest y procedencia, sin consultas o páginas crudas. No se usa el resumen de totales upstream: se recalcula sobre filas verificadas.

La ausencia de snapshots devuelve dependencia no disponible, nunca cero tráfico. Las fechas diarias no prueban el instante de recopilación: observed_at/fresh_until null y freshness unknown. Los textos explicitan que son datos del laboratorio. La captura aún no es una herramienta pública ni una sincronización programada.

Las revisiones de ideas aumentan si cambia la proyección durante la vida del adaptador. Ese contador no es persistente ni sirve para aprobar una acción tras reiniciar. Máximo 1.000 ideas con revisión y 100 capturas en memoria; al alcanzar el límite se rechaza una nueva entrada. Persistencia, caducidad operativa y autorización humana siguen pendientes.

## Límites de transporte y seguridad

Se reutiliza el SDK para inicialización y llamadas MCP; no se implementa un protocolo alternativo. Allowlist exacta: get_project, get_suggestions, get_site_stats. Un cliente nuevo por llamada evita reutilizar una sesión entre sitios. El transporte de este corte solo permite `http://127.0.0.1:<puerto>/api/mcp`, sin credenciales en URL, query, redirects ni flujo SSE de notificaciones no solicitadas. Las respuestas POST JSON/SSE finitas del motor ensayado sí están soportadas.

Cada llamada tiene un límite de 10 segundos incluyendo inicialización y lectura, y máximo 1 MiB de respuesta. No hay reintento automático en este corte. Un Command puede necesitar hasta tres llamadas; un presupuesto global y política de reintentos quedan para la integración operativa. isError, HTTP fallido y errores internos se normalizan sin texto upstream; JSON de herramienta inválido, forma inesperada y tamaño excesivo se bloquean.

Antes de consultar métricas se exige propiedad GSC/repositorio ausentes, destino manual y autoaprobaciones desactivadas. El laboratorio mantiene además la red upstream sin salida: es la barrera efectiva si una configuración cambiase entre la comprobación y la llamada. No presentar esa comprobación previa como autorización atómica para cuentas reales. El endpoint upstream de laboratorio sigue accesible en loopback al operador: no es la topología de producción privada de ADR-013.

Los tests con servidor MCP simulado cubren respuesta isError, JSON inválido dentro del texto, redirección, exceso de tamaño y timeout. Los tests de proyección cubren filas ajenas, métricas malformadas, minimización, revisión local y bloqueo de propiedades configuradas. No acreditan autenticación humana, aislamiento de credenciales reales ni seguridad integral upstream.

## Reproducir

Desde la raíz, con Docker disponible y el upstream fijado según [laboratorio](../../lab/README.md):

```powershell
npm ci --ignore-scripts
npm test
./lab/run.ps1 Up
try { npm run test:dispatch } finally { ./lab/run.ps1 Stop }
```

El harness abre un puerto Gabi efímero y lo cierra al terminar; mantiene tokens solo en memoria y procesos hijos, y guarda únicamente el informe sin secretos. Si Docker no está en su ruta habitual, definir GABI_LAB_DOCKER para el harness y usar -DockerPath para run.ps1. No ejecutar sobre otra base: el guard de fixtures rechaza dominios ajenos al laboratorio. La parada de PostgREST es exclusiva de este entorno descartable.

Siguiente hito: ofrecer estas lecturas al cliente MCP de Gabi con las mismas políticas, o construir una vista mínima que permita revisarlas. El piloto con cuentas reales requiere previamente persistencia, SecretStore y autenticación operativa.
