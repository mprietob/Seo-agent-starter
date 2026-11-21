# Modelo de amenazas y operación segura

Actualización de implementación: el [prototipo sintético](../LOCAL_PROTOTYPE.md) prueba políticas de lectura, revocación y errores con dos sitios. Los controles de proveedores, persistencia, secretos y producción descritos aquí siguen pendientes.

Fecha: 2026-09-09. Especificación para el futuro prototipo, no garantía de controles implementados. Basada en [ADR-011](../../DECISIONS.md) y en los [ensayos sintéticos](../spikes/dispatchseo-fault-report.md). No se han conectado cuentas reales ni evaluado exhaustivamente el upstream.

## Activos y límites

Se protegen credenciales de proveedores, datos de cada sitio, aprobaciones, integridad de contenido y trazabilidad de efectos externos. Agentes, páginas rastreadas y respuestas de proveedores son entradas no confiables. Una persona autenticada solo actúa sobre los sitios y acciones concedidos. El administrador de la instalación y el sistema operativo son parte de la base de confianza; un host comprometido queda fuera de la garantía de aislamiento entre usuarios.

Fronteras: cliente → autenticación/políticas Gabi → almacenamiento/cola → worker → adaptador → proveedor. El motor upstream no es una autoridad de aprobación. El worker transporta referencias de identidad y sitio verificables, no tokens del usuario ni permisos congelados. INIMA permanece externa y sin acceso directo a datos internos.

## Riesgos, controles requeridos y evidencia

| Riesgo | Control requerido | Situación / prueba de aceptación |
| --- | --- | --- |
| Referencia a datos de otro sitio | Scope obligatorio en consultas, cachés, cursores, eventos y workers | Ensayo upstream parcial; probar toda referencia A/B en Gabi |
| Credencial compartida alcanza otro repositorio o propiedad | Recursos fijados por conexión y credenciales externas con mínimo alcance por sitio; configuración solo administrativa | Riesgo reproducido con mocks; probar denegación antes de llamar al proveedor |
| Agente se declara owner o humano | Aprobación creada por servidor desde sesión humana, revisión y acción vinculadas | Bypass upstream caracterizado; esquema rechaza campos extra, autenticación pendiente |
| Caída de BD amplía permisos | Fallar cerrado, sin MCP_API_KEY legacy, sin configuración automática de respaldo | Fallback upstream caracterizado; simular fallo Gabi y comprobar cero efectos |
| Doble efecto o aprobación reutilizada | Reserva atómica, auditoría, consumo de aprobación y conciliación de unknown | Pruebas concurrentes de servicio pendientes |
| Contenido externo induce acciones o SSRF | Tratar contenido como datos; allowlist de capacidades y destinos; comprobar DNS/IP y cada redirección; bloquear destinos internos salvo mocks explícitos del laboratorio | Pruebas de redirección, DNS y prompt malicioso pendientes |
| Secretos en errores, texto libre o logs | Proyección de campos permitidos, límites de tamaño y redacción antes de persistir o mostrar | additionalProperties no detecta secretos en textos; pruebas con valores señuelo pendientes |
| Falsa publicación o evidencia antigua | Verificar hechos con proveedor, normalizar estados, mostrar frescura desconocida | done upstream no acredita merge; verificación de publicación pendiente |
| Robo de sesión o cambio de configuración | TLS fuera de loopback, sesiones seguras, protección CSRF para acciones humanas, permisos administrativos separados | Transporte y autenticación todavía por elegir y probar |

## Secretos y cifrado

La aplicación guardará únicamente referencias opacas y metadatos de conexión (sitio, proveedor, recursos autorizados, versión y estado). Un puerto SecretStore ofrecerá guardar, obtener para una operación autorizada, rotar y revocar. Solo el adaptador autorizado puede recuperar el valor; nunca se devuelve al cliente, modelo, evento o PR. Rotar invalida cachés y trabajos no iniciados; revocar bloquea nuevas llamadas. No ejecutar código de PRs con credenciales de escritura.

El backend del almacén queda por seleccionar. Debe proporcionar cifrado autenticado mediante una biblioteca mantenida, claves separadas de los datos y copias, control de acceso y rotación. No diseñar criptografía propia. Si falta la clave o falla el almacén, el arranque o la operación dependiente falla cerrado; no hay fallback a texto plano. Backups y volúmenes con datos sensibles requieren cifrado y restauración probada; la custodia y recuperación de claves se documentarán al elegir el despliegue. Una referencia en la BD no sustituye estos controles.

## Retención inicial propuesta para implementar

Estos valores son defaults operativos del prototipo, configurables por el administrador y sujetos a revisión antes del piloto; no acreditan cumplimiento jurídico. Toda retención se aplica por sitio, también en índices y cachés.

| Clase | Default y eliminación |
| --- | --- |
| Capturas brutas de evidencia | 7 días; evitar PII y secretos desde la ingesta |
| Métricas normalizadas y evidencias | 180 días desde captura |
| Logs operativos redactados | 14 días |
| Auditoría, aprobaciones y ejecuciones terminadas | 365 días |
| Reservas de idempotencia | 90 días desde finalización; unknown se conserva hasta conciliar |
| Ideas y configuración activas | Mientras el sitio esté activo; ideas canceladas/rechazadas, 180 días |
| Backups cifrados | Ventana máxima de 30 días |

Borrar un sitio revoca primero acceso y conexiones; elimina datos online en 24 horas. Las copias expiran dentro de 30 días. Una restauración debe reaplicar el registro de borrados antes de habilitar tráfico. Conservar una marca mínima de borrado sin contenido durante esa ventana. Tras expirar una reserva, el cliente no debe reutilizar su clave; operaciones externas requieren además conciliación por referencia duradera del proveedor. Las evidencias caducadas dejan una referencia de auditoría sin contenido y se muestran como no disponibles.

## Puerta de entrada al piloto

Antes de cuentas reales: implementar y probar los controles de la tabla, restauración y borrado; demostrar que una caída de dependencia no ejecuta efectos; inspeccionar respuestas y logs con secretos señuelo; documentar custodia de claves y límites de cada credencial externa. Mantener publicación y merge desactivados. Los [contratos](../../contracts/README.md) son la base verificable de formato, no una implementación de estas garantías.
