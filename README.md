# Gabi SEO

Starter open-source y self-hosted para operar SEO con agentes, control humano y cuentas propias. El nombre es provisional y el proyecto está en fase de bootstrap arquitectónico: todavía no contiene una aplicación ejecutable ni conecta servicios externos.

El piloto previsto es [Pinturas Gabriel Ferrol](https://pinturasgabrielferrol.netlify.app/). Su propiedad de Google Search Console ya está verificada, pero esta primera tanda no la conecta ni almacena credenciales.

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

Esta tanda no copia su código. Antes de implementar el motor se realizará una evaluación reproducible para elegir entre desplegarlo sin modificar como servicio upstream, mantener un fork AGPL o implementar solo adaptadores compatibles. La preferencia inicial es composición sobre APIs/MCP para reducir acoplamiento y facilitar actualizaciones.

## Límites del sistema

| Ámbito | Responsabilidad | Regla |
| --- | --- | --- |
| Upstream open-source | Motor SEO reutilizado, inicialmente evaluando DispatchSEO | Consumir sin copiar; conservar licencia y atribución del upstream |
| Gabi SEO | Orquestación, contratos, políticas y capacidades diferenciales | Código propio de este repositorio bajo AGPL-3.0 |
| Integraciones opcionales | Google, GitHub, proveedores de analítica, IA y datos | Adaptadores reemplazables; claves aportadas por el usuario |
| INIMA | Aplicación propietaria futura | Sistema externo; solo contrato versionado, autenticado y sin código compartido |

Consulta [ARCHITECTURE.md](ARCHITECTURE.md), [ROADMAP.md](ROADMAP.md) y [DECISIONS.md](DECISIONS.md) antes de implementar.

## Estado actual

- Documentación arquitectónica inicial: completa.
- Dependencias y código de aplicación Gabi: ninguno. Harness de laboratorio en [lab/](lab/README.md), sin dependencias propias.
- Search Console, GitHub y otras cuentas: no conectadas.
- Producción: sin despliegue. Upstream probado en Docker local con datos sintéticos; contenedores detenidos al terminar.
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
