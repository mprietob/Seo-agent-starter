# Despliegue privado: seo.inimamed.com

Este directorio permite instalar el panel sin publicar directamente su puerto en el host. El proceso escucha en `0.0.0.0:4407` dentro de la red Docker privada `inima-net`; Caddy es el único servicio que atiende `https://seo.inimamed.com`.

En el servidor:

1. Copiar el proyecto y crear `deploy/.env` a partir de `.env.production.example`.
2. Usar `docker compose -f deploy/docker-compose.production.yml up -d --build`. Esta variante se une a la red Docker externa `inima-net` ya usada por Caddy y no abre puertos del panel al exterior.
3. Añadir `deploy/Caddyfile` a la configuración existente de Caddy y recargarla.
4. Entrar en el subdominio con el usuario `gabi` y la contraseña privada configurada.

La aplicación solo lee WordPress y ZeroRank. Aprobar una propuesta mantiene el cambio dentro de su cola interna; no publica en WordPress. Antes de pasar a producción hay que verificar la configuración real de TLS, DNS, cortafuegos y copias de seguridad del servidor.

## Recuperación y configuración privada

El repositorio incluye el código de la instalación privada existente; no incluye `deploy/.env` ni el volumen `.local` con snapshots, propuestas o tokens OAuth cifrados. Para recuperar una instalación, restaurar también esos archivos desde su copia privada; clonar GitHub no recupera las conexiones ni sus datos.

`GABI_DASHBOARD_PASSWORD` se usa para autenticar al usuario `gabi` y como secreto del cifrado OAuth y de la firma del estado de Google. Cambiarla sin migrar el archivo cifrado invalida la conexión guardada. Conservar el secreto privado junto con el backup del volumen y no documentar su valor en GitHub.
