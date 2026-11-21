# Panel local de demostración

Implementado el 2026-09-09. Es una interfaz de lectura sobre los dos sitios sintéticos del prototipo. No muestra datos de Gabriel, no conecta proveedores y no permite aprobar o publicar. El adaptador DispatchSEO sigue teniendo su ensayo independiente; este selector no puede usarse para dar acceso a sitios reales.

## Abrir

Desde la raíz del repositorio, con Node.js 24 y dependencias instaladas:

```powershell
npm run build
npm start
```

Abrir `http://127.0.0.1:4406/`. La misma ejecución mantiene HTTP `/v1/commands` y MCP `/mcp`. El panel comienza con el sitio de ejemplo A y permite cambiar a B, actualizar los datos, abrir una evidencia y cerrar la vista. No es necesario copiar tokens para usar esta demostración. Mantener `src/dashboard/` junto al build: los assets locales se cargan desde el repositorio al arrancar. Tras cambiar HTML/CSS/JS, reiniciar el proceso y recargar la página; no hay hot reload.

## Qué muestra

- Nombre, dominio y estado del sitio devueltos por site.read.
- Ideas pendientes devueltas por ideas.list, con un máximo de 100; el contador describe esta consulta, no el total global.
- Evidencias vinculadas, consultadas por su ID: resumen, fuente, clasificación, fecha de observación, captura y frescura. Una fecha desconocida no se sustituye por la fecha actual.
- Estados de carga, ausencia de ideas/evidencias, cierre y error. Actualizar o cambiar de sitio retira los datos anteriores mientras se consulta; respuestas antiguas se descartan mediante cancelación y generación de vista.

La tarjeta de frescura invita a revisar cada evidencia; no calcula un indicador global de calidad SEO. La hora del pie corresponde a la última lectura de la pantalla, no a la antigüedad de las observaciones. El consejo lateral es orientación fija para revisar evidencias, no una recomendación generada por IA ni un hallazgo sobre el sitio.

## Implementación y permisos

HTML, CSS y JavaScript sin framework ni dependencias nuevas. Se reutiliza Fastify para servir tres assets locales y createService para las consultas. Los textos de datos se insertan con textContent, nunca como HTML ni enlaces arbitrarios. La política de contenido solo permite recursos del propio servidor, bloquea scripts inline y evita que la página se incruste en otro origen.

El montaje es explícito en `src/local.ts`. `createApp()` por sí solo no expone el panel ni el selector. `registerDemoDashboard()` exige LocalAuthenticator y SyntheticRepository; no acepta el adaptador DispatchSEO. Es una guardia de construcción del prototipo, no una certificación del contenido que un desarrollador pudiera introducir manualmente en esas clases.

| Ruta | Función |
| --- | --- |
| GET / | Página pública de la demostración, sin datos de sitio incrustados |
| GET /dashboard/config | Dos claves de selección y etiquetas, sin credenciales ni IDs internos |
| POST /dashboard/session | Seleccionar únicamente uno de los sitios sintéticos y emitir acceso de navegador |
| POST /dashboard/read | Traducir cookie a identidad y pasar Command al servicio común |
| POST /dashboard/logout | Revocar acceso del navegador y retirar su cookie |

La selección local concede acceso deliberadamente a datos ficticios; no es un inicio de sesión de producción. El selector nunca recibe site_id arbitrario. Se comprueba Host/Origin loopback y se exige Origin en POST. El acceso se guarda en cookie HttpOnly, SameSite=Strict y Path=/dashboard; no se entrega a JavaScript ni se guarda en localStorage. El navegador conserva la cookie hasta una hora; el registro de credenciales en memoria se revoca al cambiar/cerrar o al reiniciar, y todavía no implementa una caducidad autónoma de servidor. No usar este mecanismo con datos sensibles.

El cookie de demostración no autoriza `/mcp` ni `/v1/commands`. Esas entradas siguen requiriendo sus propias cabeceras. Cerrar la vista no revoca credenciales independientes de clientes MCP. Una conexión real necesitará autenticación operativa y cookies seguras sobre HTTPS; no se habilitan en esta tanda.

## Verificación

33 pruebas automatizadas correctas, incluidas seis nuevas de panel: montaje opt-in, backend sintético obligatorio, assets/CSP, selección y revocación, evidencia cruzada, origen externo, consulta sin credencial, validación común, suspensión, fallos y cierre independiente de MCP. No se repitió el laboratorio Docker porque no cambió el adaptador upstream.

Revisión manual con el navegador integrado: carga inicial A, apertura de evidencia, cambio a B con retirada del detalle anterior, cierre de la vista, recarga de la versión final y evidencia en móvil. Viewport móvil de 390 × 844; ancho visible y de contenido medidos en 375 px (el resto corresponde a la barra de desplazamiento), sin desbordamiento horizontal. Se restauró el viewport normal. La pantalla tiene etiquetas de formularios, enlace para saltar al contenido, foco visible, regiones de estado y estilos que respetan reducción de movimiento; no se ha realizado una auditoría completa de accesibilidad.

Pendiente: datos persistentes, usuarios reales, permisos operativos, conexión visual al motor, aprobación y publicación. El panel actual permite revisar el flujo y el lenguaje antes de introducir esas capacidades.
