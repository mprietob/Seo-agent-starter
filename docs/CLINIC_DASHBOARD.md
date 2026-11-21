# Panel privado de Clínica Marta Prieto

`npm run start:clinic` abre el panel de seguimiento local en `http://127.0.0.1:4407`. Su primera lectura guarda una línea base de metadatos públicos en `.local/clinica-marta-baseline.json`; las actualizaciones posteriores comparan esa referencia con la web actual. No usa la contraseña de WordPress y no puede publicar.

Para desplegarlo fuera del ordenador, se configura explícitamente `GABI_BIND_HOST=0.0.0.0` y una contraseña no vacía en `GABI_DASHBOARD_PASSWORD`. El proceso se niega a escuchar externamente si falta esa contraseña. Un proxy HTTPS del servidor (por ejemplo, para `seo.inimamed.com`) debe terminar TLS y restringir acceso adicionalmente. Estas variables permanecen solo en el servidor, nunca en Git.

La imagen y `docker-compose.clinic.yml` están preparados para ese despliegue. El contenedor se enlaza por defecto solo a `127.0.0.1:4407` del servidor: el proxy HTTPS es el único componente que debe exponer el subdominio. El volumen `clinic_seo_data` conserva las líneas base y las propuestas entre reinicios. En el servidor se guardarán únicamente `GABI_DASHBOARD_PASSWORD`, `GABI_REVIEWER_ID` y `CLINIC_ZERORANK_API_KEY`; no se añaden al repositorio. No se despliega hasta revisar el servidor, crear la contraseña y configurar el proxy.

Cada propuesta enseña un texto de trabajo y queda pendiente. Aprobarla desde el panel no toca WordPress: solo deja constancia de la aprobación humana y la habilita para el siguiente paso, preparar un borrador. Para habilitar ese botón en el despliegue privado se añade `GABI_REVIEWER_ID` con un UUID estable del revisor; la ruta exige además que el formulario venga del mismo panel.

Estado actual: comparación pública WordPress lista; ZeroRank ya tiene lector separado y Search Console espera autorización de la clínica. El despliegue de producción requiere persistencia adecuada, gestión de secretos, copias de seguridad y autenticación de usuario más completa que la protección inicial de este MVP.
