# Gabi SEO

Starter open-source y self-hosted para operar SEO con agentes, control humano y cuentas propias. El nombre es provisional. Incluye un [prototipo local de lectura](docs/LOCAL_PROTOTYPE.md) con datos sintéticos y el panel privado desplegado para Clínica Marta Prieto y Pinturas Gabriel.

El piloto es [Pinturas Gabriel Ferrol](https://pinturasgabrielferrol.netlify.app/). Su panel mantiene los datos separados de Clínica Marta Prieto; la conexión de Search Console del proyecto de pinturas sigue pendiente.

## Sincronización del código desplegado · 21/11/2026

GitHub conservaba únicamente el bootstrap arquitectónico. Esta actualización recupera el código fuente, los contratos, las pruebas y los archivos de despliegue de la instalación existente. El panel privado responde en `https://seo.inimamed.com/` (clínica) y `/gabi` (pinturas), con autenticación obligatoria.

La instalación conserva una conexión OAuth de Google cifrada y snapshots de Search Console de la clínica. Esos datos, la configuración `.env` y las claves permanecen fuera de Git. Esta sincronización no renueva permisos externos ni despliega cambios en el servidor. Los informes de laboratorio y las decisiones con fecha anterior conservan su alcance histórico.

## Principios

- Reutilizar software open-source antes de construir una alternativa propia.
- Mantener a la persona en el circuito para aprobar ideas y cambios publicados.
- Publicar mediante ramas y pull requests; nunca escribir directamente en producción.
- Aislar cada sitio y sus credenciales en un modelo multi-site desde el inicio.
- Tratar las claves como configuración aportada por cada instalación, nunca como datos del repositorio.
- Mantener INIMA fuera del límite AGPL mediante una integración externa y opcional.
- No afirmar que una integración existe hasta que tenga implementación y una prueba real.

## Alcance previsto

El producto cubrirá progresivamente investigación y seguimiento SEO, Search Console, cola de ideas, aprobaciones, automatizaciones, publicación en GitHub, SEO técnico, SEO local, Google Business Profile, reseñas, conversiones/leads y visibilidad en buscadores de IA (GEO). Claude Code, Codex, Cursor y otros clientes compatibles con MCP podrán operar sobre los mismos contratos.

## Estrategia respecto a DispatchSEO

[DispatchSEO](https://github.com/NeoZi12/dispatchseo) es la referencia principal y ya resuelve gran parte del bucle SEO: estado persistente, cola y aprobaciones, multi-site, MCP, Search Console, programación, creación de pull requests, rankings, backlinks, tendencias y visibilidad en respuestas de IA. Está licenciado bajo AGPL-3.0.

No se copia su código. ADR-013 selecciona composición mediante MCP para lecturas, con el motor separado y sin modificar. La [conexión de la fachada al laboratorio](docs/spikes/gabi-dispatch-report.md) está probada; cuentas reales y adopción de escrituras siguen pendientes.

## Límites del sistema

| Ámbito | Responsabilidad | Regla |
| --- | --- | --- |
| Upstream open-source | Motor SEO reutilizado, inicialmente evaluando DispatchSEO | Consumir sin copiar; conservar licencia y atribución del upstream |
| Gabi SEO | Orquestación, contratos, políticas y capacidades diferenciales | Código propio de este repositorio bajo AGPL-3.0 |
| Integraciones opcionales | Google, GitHub, proveedores de analítica, IA y datos | Adaptadores reemplazables; claves aportadas por el usuario |
| INIMA | Aplicación propietaria futura | Sistema externo; solo contrato versionado, autenticado y sin código compartido |

Consulta [ARCHITECTURE.md](ARCHITECTURE.md), [ROADMAP.md](ROADMAP.md) y [DECISIONS.md](DECISIONS.md) antes de implementar.

## Estado actual

- [Panel local de demostración](docs/DASHBOARD_LOCAL.md) disponible en `http://127.0.0.1:4406/`: sitio, ideas y evidencias, con selector de datos ficticios. Arranque: `npm run build` y `npm start`.

- Seguimiento local de Clínica Marta Prieto: `npm run start:clinic` abre `http://127.0.0.1:4407/`. Guarda una línea base de metadatos públicos y compara cada lectura posterior; no contiene credenciales ni puede modificar WordPress.
  Instrucciones y límites de despliegue: [docs/CLINIC_DASHBOARD.md](docs/CLINIC_DASHBOARD.md).

- Integración y stack del prototipo seleccionados en [ADR-013 y su análisis](docs/spikes/prototype-stack.md): DispatchSEO separado y fachada TypeScript. Primer corte sintético implementado: [ejecución y límites](docs/LOCAL_PROTOTYPE.md).

- Documentación arquitectónica inicial: completa.
- [Contratos v1.0.0](contracts/README.md) y [modelo de amenazas](docs/security/THREAT_MODEL.md) definidos. 55 comprobaciones de formato en Python y paridad en Ajv. Políticas de lectura sintética verificadas; autenticación de producción pendiente.
- Código Gabi en src/: Fastify, Ajv, TypeScript y SDK MCP oficial con versiones fijadas. El panel, HTTP y [MCP propio](docs/MCP_LOCAL.md) reutilizan la misma política de aplicación. El [piloto local de Search Console](pilot/README.md) está preparado en solo lectura y pendiente de su primera verificación con credenciales locales.
- Integración: [9 escenarios HTTP Gabi→DispatchSEO](docs/spikes/gabi-dispatch-report.md) y [4 escenarios de entrada MCP](docs/spikes/gabi-mcp-results.json) correctos, en ejecuciones separadas. Harness upstream en [lab/](lab/README.md).
- ZeroRank: lector REST de solo lectura implementado y verificado contra el workspace autorizado. El inventario de prompts puede pasar a evidencia y a una propuesta de borrador pendiente, siempre con selección y revisión humanas. No llama al escritor de ZeroRank ni publica; conversaciones, respuestas, citas y métricas aún no llegan al panel. El alcance y los controles están en [docs/ZERORANK.md](docs/ZERORANK.md).
- Investigación de preguntas: el núcleo acepta señales de repositorios o exportaciones autorizadas como evidencia trazable y las convierte únicamente en propuestas pendientes. Cada proveedor se conectará por un adaptador propio tras verificar licencia, API, coste y límite de cuota.
- Criterio y primer proveedor candidato para investigación de preguntas: [docs/QUESTION_RESEARCH.md](docs/QUESTION_RESEARCH.md).
- Despliegue privado existente: panel de clínica y pinturas en Docker detrás de Caddy. Véase [deploy/README.md](deploy/README.md). Esto no acredita un despliegue productivo de DispatchSEO ni habilita publicación automática.
- Tanda 1 en curso: [matriz](docs/spikes/dispatchseo-evaluation.md), [inventario MCP](docs/spikes/dispatchseo-mcp-inventory.json), [plan de contratos](docs/spikes/dispatchseo-contract-plan.md) e [informe del ensayo](docs/spikes/dispatchseo-lab-report.md). 12 comprobaciones de caracterización correctas; adopción e aislamiento integral pendientes.
- [Ensayo adicional de fallos y credenciales](docs/spikes/dispatchseo-fault-report.md): nueve casos caracterizados entre dos ejecuciones; controles necesarios documentados en ADR-011. No se han conectado proveedores reales.

## Desarrollo seguro

Las reglas para agentes y personas colaboradoras están en [AGENTS.md](AGENTS.md). No añadas secretos al repositorio. Los futuros ejemplos deberán usar nombres ficticios y variables vacías; los archivos `.env` permanecen ignorados.

## Fuentes primarias revisadas

- [Repositorio y README de DispatchSEO](https://github.com/NeoZi12/dispatchseo)
- [Arquitectura de DispatchSEO](https://github.com/NeoZi12/dispatchseo/blob/main/src/content/docs/architecture.mdx)
- [Automatizaciones de DispatchSEO](https://github.com/NeoZi12/dispatchseo/blob/main/src/content/docs/automations.mdx)
- [Publicación y GitHub en DispatchSEO](https://github.com/NeoZi12/dispatchseo/blob/main/src/content/docs/publishing.mdx)
- [Soporte de agentes de DispatchSEO](https://github.com/NeoZi12/dispatchseo/blob/main/docs/AGENTS.md)
- [Licencia GNU AGPL v3](https://www.gnu.org/licenses/agpl-3.0.html)

La inspección se realizó contra el commit upstream `89fa4b7` del 4 de septiembre de 2026. Las capacidades pueden cambiar; se deben volver a verificar antes de integrar.

## Licencia

Gabi SEO se distribuye bajo [GNU Affero General Public License v3.0](LICENSE). Las dependencias, servicios externos y agentes conservan sus propias licencias y condiciones.
