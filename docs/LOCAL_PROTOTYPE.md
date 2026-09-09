# Prototipo local de lectura

Implementa el primer corte de ADR-013 con datos sintéticos en memoria. No conecta DispatchSEO, Google, GitHub ni INIMA; no persiste datos SEO y no permite escrituras. No es una autenticación de producción.

## Ejecutar

Requiere Node.js 24 y npm. Desde la raíz:

```powershell
npm ci --ignore-scripts
npm test
npm start
```

`npm test` compila TypeScript y ejecuta pruebas de contratos, políticas, HTTP y un arranque loopback real. `npm start` usa esa compilación y escucha exclusivamente en `127.0.0.1:4406`. Para compilar sin pruebas: `npm run build`. Detener con Ctrl+C.

El arranque crea dos sitios y credenciales aleatorias en `.local/synthetic-access.json`, ignorado por Git. Solo sirven en ese proceso para datos ficticios; no se imprimen en consola. Al reiniciar cambian los sitios y las credenciales, y las anteriores dejan de funcionar. No compartir ni subir ese archivo. En Windows los permisos efectivos dependen de la ACL de la carpeta; el modo POSIX del archivo no la sustituye. No usar este mecanismo con datos reales.

Consultar el sitio A sin imprimir la credencial:

```powershell
$gabiAccess = Get-Content .local/synthetic-access.json -Raw | ConvertFrom-Json
$gabiHeaders = @{ Authorization = 'Bearer ' + $gabiAccess[0].token }
$gabiCommand = @{
  record_type = 'Command'
  schema_version = '1.0.0'
  request_id = [guid]::NewGuid().ToString()
  operation = 'site.read'
  payload = @{}
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:4406/v1/commands -Headers $gabiHeaders -ContentType application/json -Body $gabiCommand
```

## Superficie disponible

`POST /v1/commands` admite los Command v1 de site.read, ideas.list y evidence.read. Respuesta 200: un Site, una lista de Idea o una Evidence respectivamente. ideas.list filtra por status y devuelve como máximo limit (20 por defecto, 100 máximo). Este corte no ofrece paginación: rechaza cursor explícitamente y la lista puede ser parcial. evidence.read usa evidence_id obtenido en evidence_refs de las ideas.

El resto produce Error v1: 400 entrada inválida, 401 credencial ausente/revocada, 404 recurso ausente o no autorizado, 502 salida inválida, 503 dependencia fallida. El request_id de un comando validado se conserva; entradas no validadas reciben uno generado por servidor. Los detalles de excepciones no se devuelven. Sin logs de cuerpo/Authorization y respuestas no-store. Body máximo 16 KiB; errores de parseo o tamaño se normalizan a 400.

## Qué se prueba y qué falta

- Los mismos 14 ejemplos válidos y 27 mutaciones inválidas del contrato se comprueban con Ajv, incluidas las 14 comprobaciones de entrada exclusiva Command: 55 aserciones, comparables al validador Python.
- Políticas: sitios A/B, evidencia ajena/inexistente, credenciales ausentes/revocadas, suspensión, escrituras denegadas, campos extra/coerción/cursor rechazados, filtros y límites.
- Fallos: dependencia sin fallback, respuesta con campos extra o de otro sitio, revocación durante lectura, cuerpos HTTP inválidos y arranque con petición real en loopback.

El repositorio sintético no garantiza todavía integridad relacional general entre referencias; solo genera fixtures coherentes y verifica sitio y contrato de los registros devueltos. No se han probado cuotas, carga, persistencia, TLS, sesiones humanas, almacén de secretos, aprobación, colas ni efectos remotos. Los límites de timeout/reintentos del futuro adaptador no están implementados: aquí no hay llamadas externas.

La siguiente integración debe mapear una allowlist de herramientas MCP contra la versión fijada de DispatchSEO, conservar la política común en `src/gabi/service.ts` y probar la frontera real. No reemplazarla por reenvío genérico de herramientas.

## Dependencias reutilizadas

Fastify resuelve HTTP; Ajv y ajv-formats validan el contrato existente; TypeScript comprueba tipos; node:test evita añadir otro runner. Versiones exactas en package.json y package-lock.json. El compilador se fija en TypeScript 5.9.3 deliberadamente; no se necesita migrar a una versión mayor para este corte. El SDK MCP se instalará cuando exista su adaptador. Las licencias de terceros permanecen independientes de la licencia Gabi.

Verificado el 2026-09-09 con Node.js 24.14.1: compilación y 12 pruebas correctas. El lockfile registra 53 paquetes externos: 44 MIT, 5 BSD-3-Clause, 3 ISC y 1 Apache-2.0. La instalación sin scripts informó cero vulnerabilidades conocidas en su auditoría npm de ese momento; no equivale a una auditoría de seguridad del producto.
