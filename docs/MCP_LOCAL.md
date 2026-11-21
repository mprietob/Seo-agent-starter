# MCP de Gabi: lecturas locales

Estado 2026-09-09: implementado y probado con el cliente oficial MCP TypeScript 1.30.0. No se han configurado clientes personales ni cuentas reales. Transporte HTTP Streamable sin sesiones persistentes, solo para el entorno loopback.

## Arranque y conexión

Desde la raíz del repositorio:

```powershell
npm ci --ignore-scripts
npm test
npm start
```

`npm start` sirve simultáneamente `/v1/commands` y `/mcp` en `http://127.0.0.1:4406`, usando exclusivamente los dos sitios sintéticos. En un cliente compatible con Streamable HTTP, configurar la URL `http://127.0.0.1:4406/mcp` y la cabecera `Authorization: Bearer <credencial Gabi local>`. Obtener esa credencial del archivo ignorado `.local/synthetic-access.json` generado al arrancar: primera entrada para A, segunda para B. No usar un token DispatchSEO, ni poner credenciales en query o configuración versionada. No se publica una configuración específica para Codex/Claude/Cursor sin haberla probado en ese cliente.

Las credenciales cambian al reiniciar. El mecanismo local mantiene permisos en memoria y no sustituye autenticación, sesiones humanas ni SecretStore de producción. Se detiene con Ctrl+C. Véanse los [límites del prototipo](LOCAL_PROTOTYPE.md).

## Herramientas

| Herramienta | Argumentos | Resultado |
| --- | --- | --- |
| gabi_site_read | `{}` | Site autorizado |
| gabi_ideas_list | status y limit opcionales | Lista de Idea del sitio, máximo 100 |
| gabi_evidence_read | evidence_id | Captura Evidence existente del sitio |

Los esquemas de argumentos se derivan del payload de Command v1, resolviendo referencias locales. La validación efectiva es la misma de `src/gabi/service.ts` usada por HTTP; no se duplican modelos ni políticas. Se rechazan site_id, actor, endpoint o credenciales dentro de argumentos. El esquema general describe cursor, pero esta versión lo rechaza porque la paginación aún no existe. En el adaptador DispatchSEO solo se permiten ideas pending (por defecto) o rejected; no se traducen sus estados aprobados a autoridad Gabi.

Cada resultado incluye un bloque text con JSON y `structuredContent.result` con ese mismo objeto o lista. Un fallo de negocio devuelve `isError: true` y Error v1, con identificador generado por Gabi. Un 200 HTTP no basta para declarar éxito: comprobar isError. Una credencial Gabi ausente o revocada devuelve 401 antes de inicialización, descubrimiento o llamada; un fallo de autenticación del motor se sigue expresando como dependencia no disponible, sin culpar al usuario Gabi.

Las anotaciones de lectura son informativas. La protección procede de una lista cerrada de tres herramientas y de las políticas compartidas. No existen herramientas de propuesta, aprobación, configuración de proveedores, publicación o merge; tampoco un reenvío genérico hacia las herramientas upstream.

## Frontera HTTP y ciclo de vida

Cada POST autentica de nuevo y usa su propio Server/transport del SDK, cerrado al responder. No se emiten IDs de sesión, no se conserva identidad de initialize y no se comparten conexiones entre credenciales. Los handlers de herramientas vuelven a pasar por el servicio, que revalida acceso antes de devolver datos. Herramientas/listado y protocolo no requieren consultar la BD upstream; descubrir herramientas no garantiza que una lectura vaya a estar disponible.

Solo se admiten Host `127.0.0.1:<puerto>` o `localhost:<puerto>` del servidor local. Origin debe estar ausente o coincidir con una de esas direcciones HTTP. No se habilita CORS abierto. Se rechazan parámetros de query y batches. GET y DELETE autenticados devuelven 405: este corte no ofrece un stream de notificaciones ni sesiones que eliminar. El SDK negocia el protocolo y emite las respuestas JSON finitas. Fastify limita el cuerpo a 16 KiB antes de entregarlo al SDK; errores de parseo se devuelven sin contenido del cuerpo. Todas las respuestas llevan no-store; no se registran Authorization ni argumentos.

No hay OAuth, SSE persistente, reanudación, notificaciones, tareas duraderas ni soporte remoto/TLS en esta tanda. Tampoco se promete compatibilidad con cada aplicación que use MCP: la interoperabilidad medida corresponde al SDK oficial fijado.

## Verificación

`npm test`: 27 pruebas correctas en total. Siete grupos nuevos prueban descubrimiento, paridad HTTP/MCP en las tres lecturas, concurrencia A/B, referencias ajenas, inyección de sitio/actor, herramientas de escritura inexistentes, revocación tras initialize, suspensión, fallo de dependencia, Host/Origin y límites HTTP. La prueba de Host utiliza HTTP nativo porque Node fetch sustituye esa cabecera.

El [informe JSON del ensayo MCP integrado](spikes/gabi-mcp-results.json) contiene cuatro escenarios correctos contra DispatchSEO en Docker:

1. Descubrimiento y tres lecturas reales en ambos sitios.
2. Denegación de evidencia ajena, selección de otro sitio y merge.
3. Revocación upstream y Gabi con clientes ya inicializados.
4. Ideas y configuración de proveedores intactas durante las lecturas.

Reproducir solo este incremento, sin repetir el ensayo HTTP anterior:

```powershell
./lab/run.ps1 Up
try { npm run test:mcp:dispatch } finally { ./lab/run.ps1 Stop }
```

El harness reutiliza la preparación de fixtures del [ensayo HTTP](spikes/gabi-dispatch-report.md), mantiene credenciales en memoria y guarda únicamente resultados sin secretos. No sobrescribe la evidencia histórica de los nueve escenarios HTTP. Las capturas de métricas se preparan por el operador del harness, no mediante una herramienta pública. Al terminar esta ejecución, clientes MCP, servidor Gabi temporal y contenedores del laboratorio quedaron detenidos.
