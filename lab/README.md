# Laboratorio local de DispatchSEO

Harness de caracterización de Tanda 1, no aplicación Gabi. Usa el upstream sin modificar en una carpeta hermana y no incorpora su código al producto. DispatchSEO conserva su licencia AGPL y atribución: https://github.com/NeoZi12/dispatchseo.

## Preparación

Requiere Git, PowerShell y Docker Desktop con motor Linux. Desde la carpeta que contiene este repositorio:

```powershell
git clone --no-checkout https://github.com/NeoZi12/dispatchseo.git dispatchseo-lab-upstream
git -C dispatchseo-lab-upstream checkout --detach fbf28b2ee58bbbd6ee94dbd61e0bb9627bb59a26
```

La estructura esperada es `seo-agent-starter/lab/` junto a `dispatchseo-lab-upstream/`. No colocar el upstream dentro de Gabi ni dentro de `sources/`.

Desde la raíz de Gabi:

```powershell
./lab/run.ps1 Build
./lab/run.ps1 Up
./lab/run.ps1 Status
# Esperar a que app esté healthy antes de Probe.
./lab/run.ps1 Probe
./lab/run.ps1 Stop
```

Si Docker no está en PATH ni en la instalación por usuario habitual, pasar `-DockerPath` con la ruta del ejecutable. Build verifica el commit y que el checkout upstream esté limpio. La construcción descarga dependencias; el aislamiento de red corresponde a los contenedores de ejecución.

Build/Up generan `.env.lab` solo si no existe, con tres secretos aleatorios exclusivamente locales. El archivo está ignorado por Git. No imprimir `docker compose config` completo ni inspeccionar/exportar variables de los contenedores: contienen esos valores. Conservar `.env.lab` junto con el volumen para repetir el ensayo; no regenerarlo mientras se reutiliza la base existente.

## Aislamiento

- Proyecto Docker: `gabi-seo-lab`; volumen exclusivo `gabi-seo-lab_pgdata`.
- App, Postgres y PostgREST solo pertenecen a la red interna `gabi-seo-lab_isolated`.
- Nginx tiene además una red de entrada y publica solo `127.0.0.1:4405`. Reenvía a un destino fijo, app:3000; no es un proxy genérico de salida. Esta entrada se añadió porque Docker no publicaba el puerto de la app conectada únicamente a la red interna.
- No se arrancan cron, builder ni Caddy. No hay credenciales de proveedores. Los dos sitios usan modo custom con todos los flags de automatización desactivados y destino manual.
- No hay montajes de carpetas personales, socket Docker ni credenciales de usuario. Solo se monta SQL upstream de migraciones y configuración del proxy, en lectura.
- La app tiene telemetría desactivada; el proxy no guarda access logs.

Mientras esté arrancado, `http://127.0.0.1:4405/api/health` devuelve estado de salud. El dashboard no se ha validado visualmente ni configurado mediante su wizard; este ensayo opera por MCP. Su contraseña está en `.env.lab`, nunca en los informes.

## Fixtures y resultados

`probe.mjs` usa Node ya incluido en la imagen, sin añadir dependencias a Gabi. Se ejecuta dentro de app mediante stdin. Accede a PostgREST únicamente como administrador de fixtures del laboratorio: crea dos sitios `.example`, asigna tokens aleatorios, añade ideas y métricas sintéticas, comprueba efectos y rota un token. Los tokens permanecen en memoria y BD.

El harness rechaza bases con dominios ajenos a los fixtures y al proyecto neutral inicial. No apuntarlo a otra instalación. Resetea las métricas del sitio A para repetir el caso vacío; restaura la idea A a pending tras las pruebas. El acceso directo a tablas NO define un contrato permitido para el adaptador Gabi.

Probe guarda `docs/spikes/dispatchseo-lab-results.json`: resultados y esquemas observados, sin tokens ni respuestas con credenciales. Un pass de caracterización puede confirmar una carencia del upstream; leer la descripción, especialmente C07. No son las 14 pruebas completas de aceptación del futuro producto.

El [informe](../docs/spikes/dispatchseo-lab-report.md) conserva alcance, incidencias y pendientes. Stop detiene solo este proyecto y conserva el volumen; no borra imágenes, checkout, secretos ni datos. No ejecutar limpieza global de Docker.
