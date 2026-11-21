# Piloto local de Pinturas Gabriel

Este directorio inicia una instancia aislada de DispatchSEO para una única propiedad de Search Console y la expone a Gabi en modo lectura. No publica, no ejecuta cron ni builders, y no conecta ZeroRank.

## Preparación local

1. Inicia Docker Desktop y espera a que el motor Linux esté disponible.
2. Crea `.local/pilot.env` (está ignorado por Git) con `PILOT_DB_PASSWORD`, `PILOT_DASHBOARD_PASSWORD`, `GABI_SYNC_SECRET`, `GABI_PROJECT_ID`, `GSC_SITE_URL` y `GSC_SERVICE_ACCOUNT_JSON`.
3. Usa `GABI_PROJECT_ID=00000000-0000-4000-8000-000000000001` y `GSC_SITE_URL=https://pinturasgabrielferrol.netlify.app/`.
4. Añade fuera de Git `PILOT_DISPATCH_TOKEN`, el token MCP de esa única instancia, en el entorno con el que arrancarás Gabi. No lo añadas a `pilot.env`, ficheros versionados ni comandos guardados.
5. Construye la imagen con `npm run pilot:build` y arranca el motor con `docker compose --env-file .local/pilot.env -f pilot/compose.yaml up -d`.
6. En otra terminal, con `PILOT_DISPATCH_TOKEN` y `PILOT_SYNC_SECRET` disponibles solo para ese proceso, inicia Gabi con `npm run start:pilot`.

`start:pilot` escucha exclusivamente en `127.0.0.1:4406` y genera `.local/pilot-access.json`. Ese archivo contiene una credencial local efímera para las tres lecturas Gabi y para la sincronización manual; no lo compartas ni lo subas.

## Sincronización manual

Con el servidor Gabi iniciado, usa la credencial de `.local/pilot-access.json` para llamar `POST http://127.0.0.1:4406/pilot/refresh`. La operación primero valida que el proyecto sigue limitado a la propiedad esperada, sin repositorio Git, sin aprobación automática y con publicación manual; después pide la captura GSC al motor y guarda solo la proyección normalizada local.

Un fallo devuelve un error redactado y no conserva ni muestra los secretos. No hay reintentos automáticos ni tareas programadas.

## Antes de ZeroRank

Completa una sincronización real, revisa las observaciones y las ideas resultantes, y conserva el piloto sin publicaciones. ZeroRank se evaluará después como otra fuente de lectura para visibilidad IA; no debe reutilizar ni ampliar las credenciales de Search Console.
