# ZeroRank: preparación de integración

ZeroRank será una fuente de lectura para visibilidad en buscadores de IA. El objetivo inicial es capturar, por sitio, prompts, respuestas completas, menciones, citas y métricas de visibilidad. No puede crear prompts, contenidos, workflows ni publicaciones.

La conexión usará la API REST `https://api.zerorank.ai/api/v1` con `Authorization: Bearer <key>`. Se descarta el MCP remoto para esta fase: su propia interfaz indica que también puede gestionar y ejecutar prompts, lo que consumiría cuota y ampliaría el alcance.

## Alcance del piloto

- Sitio: Pinturas Gabriel Ferrol.
- Consultas: el conjunto local de 30 prompts ya creado en ZeroRank.
- Servicios válidos: pintura interior, fachadas, alisado de gotelé y reparación de grietas.
- Zona: Ferrol, Narón, Neda y comarca.
- Resultado esperado: observaciones con proveedor, workspace, prompt, modelo, instante, fuentes/citas y frescura; nunca una acción automática.

## Estado verificado

El adaptador `src/integrations/zerorank.ts` está fijado a la base REST oficial y solo permite la lectura `GET /prompts`. Se verificó con la clave local del workspace autorizado el 2026-09-20, sin registrar ni imprimir la clave ni las respuestas.

La respuesta observada es paginada (`data.data`, `page`, `perPage`, `lastPage`, `total`) y cada prompt incluye, entre otros, `id`, `text`, `topic`, `status`, `location`, `tags`, `workspaceId` e instantes de ejecución. Esta observación no habilita otros endpoints ni autoriza escrituras.

## Datos necesarios para ampliar la integración

1. Crear una API key de ZeroRank para el workspace de Pinturas Gabriel y conservarla solo en la configuración local ignorada por Git.
2. Verificar la lectura REST de `GET /prompts`, ya completada con el adaptador local.
3. Incorporar resultados/respuestas, citas y visibilidad agregada únicamente cuando su documentación defina sus endpoints y esquemas.

La base URL, la autenticación Bearer y `GET /prompts` están verificados en la pantalla de la cuenta. Ninguna credencial va en `.env` versionado, tests, logs o prompts.

## Criterios de aceptación

- La conexión queda fijada al workspace de Pinturas Gabriel; una herramienta no puede indicar otro workspace.
- Solo se permiten lecturas explícitamente aprobadas.
- Cada captura conserva `site_id`, proveedor, fecha de captura y frescura; las respuestas y citas se tratan como datos no confiables.
- Fallos o respuestas malformadas no devuelven secretos ni activan un fallback.
- La primera sincronización es manual. Sin cron, workflows, creación de contenido o escritura en ZeroRank.

## Flujo de contenido con revisión humana

El adaptador incorpora una proyección local de inventario: `src/integrations/zerorank-content.ts` convierte cada prompt leído en evidencia acotada de procedencia `zerorank`. Una consulta seleccionada de forma expresa puede convertirse en una `Idea` pendiente. No genera texto, no llama a una ruta de escritura de ZeroRank y no publica.

El flujo operativo es: medir una consulta de descubrimiento → seleccionar una oportunidad con evidencia → crear un borrador en ZeroRank → revisar datos, servicios reales y afirmaciones → aprobar la idea → abrir una PR → publicar manualmente. Las preguntas que contienen el nombre de la marca sirven para auditar reconocimiento, no para decidir qué artículo crear.

Antes de conectar el escritor de ZeroRank se debe verificar su endpoint, esquema, coste/cuota y controles de escritura. No se presupone a partir del lector REST.

Para Clínica Marta Prieto el servidor usará una clave distinta en `CLINIC_ZERORANK_API_KEY`. La conexión comprueba que el inventario incluye marcadores de la clínica antes de aceptarlo; una clave válida de otro workspace se marca como configuración incorrecta y no se muestra en el panel.
