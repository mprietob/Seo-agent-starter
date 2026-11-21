# Adopción acotada y stack del prototipo

Fecha: 2026-09-09. Decisión para construir el prototipo local; no certifica producción ni una integración Gabi ya ejecutable.

## Reutilización elegida

Consumir DispatchSEO sin modificar, fijado a `fbf28b2ee58bbbd6ee94dbd61e0bb9627bb59a26`, mediante un adaptador MCP privado. El [laboratorio](dispatchseo-lab-report.md) demostró arranque y lecturas; el [ensayo de fallos](dispatchseo-fault-report.md) demostró por qué no basta entregar sus tokens a agentes. Se conserva su despliegue y sus capacidades SEO, sin copiar código ni compartir tablas con Gabi.

Para la futura conexión del piloto se elige una instancia upstream por sitio, con recursos y credenciales externas limitados a ese sitio. Es un coste operativo aceptado para reducir el alcance de un fallo. No basta separar contenedores si la cuenta externa sigue teniendo acceso amplio. La instancia de dos sitios del laboratorio se conserva exclusivamente como banco de pruebas adversarias, no como plantilla de producción.

| Alternativa | Resolución |
| --- | --- |
| Servicio upstream sin modificar + fachada | Elegida para lecturas; aprovecha lo ensayado y mantiene las políticas fuera del motor |
| Fork | Aplazado: todavía no se ha demostrado que una lectura necesaria exija cambiar upstream |
| Copiar adaptadores internos | Descartado para esta tanda: aumenta mantenimiento y acoplamiento sin resolver por sí mismo las credenciales |
| Instancia compartida de producción | No elegida: el aislamiento de proveedores no quedó acreditado |

La red debe impedir que clientes o agentes lleguen directamente al motor, PostgREST o BD. Solo el adaptador obtiene el token upstream. Configuración de conexión administrativa, nunca argumento de herramienta. Sin MCP_API_KEY legacy, cron, builders ni flags automáticos. La adopción de escrituras requiere una decisión posterior y pruebas; las capacidades de aprobación upstream no sustituyen Approval de Gabi.

## Stack mínimo seleccionado

| Componente | Elección y motivo |
| --- | --- |
| Runtime y lenguaje | Node.js 24 LTS y TypeScript estricto; un lenguaje para servicios y adaptadores, sin heredar el framework web del motor |
| Transporte HTTP | Fastify 5; reutilizar routing y pruebas de peticiones mediante inject, sin construir servidor HTTP propio |
| Validación | Ajv 8 en modo 2020-12 y ajv-formats; consumir el esquema existente, sin duplicarlo en modelos manuales |
| Transporte MCP | SDK oficial TypeScript, detrás del puerto del motor; seleccionar y fijar la versión exacta al implementar contra el upstream ensayado |
| Pruebas | node:test y assert; casos de políticas con adaptadores falsos y pruebas HTTP con inject |
| Dependencias y build | npm con lockfile, instalación reproducible con npm ci y comprobación TypeScript antes de ejecutar |
| Datos del primer corte | Repositorios sintéticos en memoria; reinicio descarta estado. Sin persistencia ni secretos reales |
| Persistencia posterior | Se mantiene la base relacional de ADR-004; motor, migraciones, cola y backend SecretStore se decidirán al introducir escritura |

Python/jsonschema permanece como validador de referencia offline del contrato, no como segundo servicio. FastAPI sería viable, pero introduciría otro conjunto de modelos si se adoptara su vía habitual de validación; aquí priorizamos consumir directamente el JSON Schema existente. Next.js se aplaza porque el primer riesgo a resolver es autorización y normalización, no renderizado. No se añaden Redis, ORM, framework de agentes ni frontend en este corte.

Precaución concreta: Fastify tiene opciones de validación que pueden modificar entradas. El validador Gabi debe usar Ajv2020 con `coerceTypes:false`, `removeAdditional:false` y `useDefaults:false`; rechazar campos extra, no borrarlos. No mezclar el esquema 2020-12 con el validador draft-07 predeterminado. Validar salidas explícitamente antes de serializar. Esquemas exclusivamente locales y de confianza; no compilar esquemas proporcionados por usuarios.

Versiones exactas y licencias de dependencias se registrarán en el lockfile y revisión de dependencias al instalar; esta elección de familias no declara una combinación ya probada. No usar etiquetas latest en imágenes del prototipo.

## Primer corte implementable

1. Crear `src/gabi/` para políticas y casos de uso; `src/integrations/` para adaptadores. El upstream permanece en la carpeta externa de laboratorio. No crear un módulo INIMA vacío.
2. Exponer un único endpoint local de Command. Autenticador intercambiable con credenciales sintéticas efímeras para dos sitios; rechazar por defecto. No aceptar actor o sitio declarados en el cuerpo. La identidad del laboratorio no es autenticación de producción.
3. Implementar site.read, ideas.list y evidence.read sobre repositorios sintéticos. idea.propose se rechaza explícitamente aunque el esquema describa su forma futura. Una lista vacía solo significa ausencia confirmada, nunca fallo de dependencia.
4. Compartir dispatcher y políticas con la futura entrada MCP. Antes de conectar el motor, definir el mapeo por capacidad contra su inventario: no reenviar nombres de herramienta arbitrarios ni inferir permisos por prefijo.
5. Validar las salidas contra v1, limitar peticiones y evitar logs del cuerpo o Authorization. Mantener el servidor en loopback y sin proveedores reales.

Aceptación del primer corte: lectura A/B correcta; credencial ausente/revocada rechazada; evidencia de B solicitada por A indistinguible de inexistente; sitio suspendido bloqueado; operaciones de escritura denegadas; campos extra y coerción rechazados; caída del repositorio devuelve dependency_unavailable sin datos de respaldo; respuesta sintética inválida bloqueada. Comparar los mismos fixtures con Ajv y el validador Python para detectar divergencias. Estos tests están pendientes, no se cuentan entre los 55 checks actuales.

El corte posterior conectará el adaptador MCP al laboratorio real y repetirá las pruebas de aislamiento en esa frontera. Hasta entonces no se anunciará compatibilidad Gabi↔DispatchSEO de extremo a extremo.

## Fuentes técnicas consultadas

- [Ciclo de soporte Node.js](https://nodejs.org/en/about/previous-releases): elección de la rama LTS 24, no de un patch inferido.
- [Validación y serialización Fastify](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/): integración de validadores y tratamiento de esquemas como código de aplicación.
- [Versiones de JSON Schema en Ajv](https://ajv.js.org/json-schema.html): 2020-12 requiere su clase específica y no comparte instancia con drafts previos.
- [SDK oficial MCP TypeScript](https://ts.sdk.modelcontextprotocol.io/): SDK reutilizable para transporte; compatibilidad exacta pendiente de la prueba contra la versión fijada del motor.
