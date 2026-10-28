# Sistema Web de Agendamiento de Citas - Plantilla de marca blanca

Sitio mobile-first para publicar servicios, administrar disponibilidad y recibir solicitudes de citas. La aplicación puede adaptarse a distintos tipos de negocios desde el panel, sin cambiar el flujo de reservas.

---

## 🌟 Características Principales

### 🎨 Plantilla personalizable
- Las instalaciones nuevas comienzan con identidad neutral y sin servicios, reseñas, promociones o imágenes de demostración.
- Desde **Datos del Negocio** se pueden cambiar el nombre, subtítulo, logo, portada, colores, textos principales, títulos de navegación y textos de los pasos de reserva.
- Los servicios, precios, horarios, instrucciones, reseñas, promociones y datos de contacto continúan administrándose desde el panel.
- Los datos de instalaciones existentes no se reemplazan al actualizar el código; las personalizaciones ya guardadas se conservan.

### 📱 1. Experiencia de Usuario Mobile-First
- **Diseño responsive**: En dispositivos móviles funciona como una aplicación nativa fluida; en computadoras de escritorio se presenta en un marco central tipo smartphone.
- **Cabecera de Perfil**: Portada, logo, nombre, especialidad y ubicación configurables.
- **Pestañas de Navegación Rápida**:
  - **Inicio**: Banner promocional activable desde el panel administrativo y botón principal de reserva.
  - **Galería**: Álbumes configurables con visor modal / Lightbox en pantalla completa.
  - **Reseñas**: Promedio calculado según las reseñas publicadas y modal interactivo para publicar nuevas reseñas.
  - ⏰ **Horarios de consultas**: Tabla de horarios con resaltado automático del día actual.

### 🗓 2. Embudo de Reserva Paso a Paso (`booking.html`)
- **Paso 1: Catálogo de Servicios**:
  - Servicios organizados por categorías colapsables.
  - Selección múltiple con cálculo instantáneo de duración y costo.
  - Descripciones desplegables ("Lee más..." / "Leer menos").
  - Barra flotante inferior fija con recuento dinámico y botón "Seguir".
- **Paso 2: Pasos a seguir**:
  - Muestra las instrucciones configuradas desde la sección administrativa **Pasos para reservar**.
- **Paso 3: Calendario Interactivo y Turnos**:
  - Calendario mensual con navegación de meses.
  - Días hábiles resaltados y días no laborales deshabilitados.
  - Generación de turnos automáticos según los horarios del día seleccionado.
  - Los horarios se muestran en la zona horaria local de quien reserva; el panel guarda el horario en la zona detectada en el dispositivo del administrador.
  - Bloqueo de horarios que se empalman con la duración completa de otra cita; el servidor vuelve a validar la disponibilidad al guardar para evitar reservas simultáneas.
- **Paso 4: Datos del Consultante**:
  - Nombre completo, WhatsApp con selector de código de país, correo electrónico y notas (modalidad presencial o virtual por videollamada).
- **Paso 5: Solicitud de reserva**:
  - La cita queda pendiente hasta que el administrador confirme el pago; mientras tanto, el horario aparece apartado en el calendario administrativo.
  - **Confirmación por WhatsApp**: Permite enviar al negocio los detalles de la consulta (consultante, lectura elegida, fecha y hora).

### ⚙️ 3. Panel de Administración Completo (`admin.html`)
- Protegido por PIN de seis dígitos, guardado con hash y configurable.
- **Métricas en Vivo**: Consultas totales, citas pendientes e ingresos estimados en MXN.
- **Gestión de Citas**: Ver y filtrar (*Todas*, *Pendientes*, *Confirmadas*, *Completadas*, *Canceladas*), crear citas manualmente con validación de disponibilidad y horario, actualizar estados sin reactivar empalmes y contactar por WhatsApp.
- **Catálogo de Servicios**: Agregar servicios, editar precios, duración y estado activo/inactivo.
- **Pasos para reservar**: Crear, editar, eliminar y reordenar las instrucciones que se muestran antes de elegir fecha y hora.
- **Horarios de Consulta**: Configurar días abiertos/cerrados, hora de inicio y cierre, horario de comida e intervalo entre consultas (15, 30, 45, 60 min). Al guardar se validan los rangos y los turnos no se ofrecen si se cruzan con la comida o exceden la hora de cierre.
- **Períodos sin atención**: Registrar rangos de fechas (por ejemplo, semanas de vacaciones) que se bloquean en el calendario de reservas.
- **Fechas permitidas para reservar**: Configurar la fecha inicial y final en las que se aceptarán citas; ambas se incluyen en el calendario.
- **Datos del Negocio**: Personalizar nombre, subtítulo, logo, portada, colores, tipografía, títulos principales, teléfono, WhatsApp, Instagram, notas y promociones, con opción para mostrar u ocultar el banner promocional.
- **Moderación de Reseñas**: Gestionar y eliminar testimonios.
- **Reportes y Exportación a Excel**: Generador de reportes mensuales de ingresos con desglose de lecturas y exportación directa a `.xlsx`.

---

## 🚀 Cómo Ejecutar el Proyecto

### Opción 1: Probar en el navegador sin base de datos
Abre `index.html` en el navegador para probar el sitio, las reservas y el panel administrativo. Los datos se guardan en `localStorage` del navegador; la primera vez que abras `admin.html`, crea un PIN de seis dígitos. Usa el mismo navegador y perfil para que el sitio, las reservas y el panel compartan los datos. Esta modalidad es para pruebas locales: no sincroniza entre dispositivos y el PIN no sustituye la autenticación segura de un servidor. Si el navegador bloquea el almacenamiento al abrir archivos directamente, sirve esta carpeta con una extensión como Live Server y abre su URL local.

La recuperación de PIN por correo y la sincronización entre dispositivos no están disponibles en esta modalidad. Para usar MySQL/MariaDB, sigue los pasos de XAMPP de la siguiente opción.

### Opción 2: XAMPP con MariaDB (compatible con MySQL)
XAMPP para Windows incluye Apache, PHP y MariaDB, compatible con el controlador MySQL de PHP.

1. Instala XAMPP desde [Apache Friends](https://www.apachefriends.org/).
2. Abre el panel de control de XAMPP e inicia **Apache** y **MySQL**.
3. Copia la carpeta del proyecto a `C:\xampp\htdocs\TarodCheck`.
4. Abre [http://localhost/phpmyadmin](http://localhost/phpmyadmin), crea una base llamada `tarot_agenda`, selecciónala y, en **Importar**, carga `C:\xampp\htdocs\TarodCheck\database\schema.sql`.
5. Abre [http://localhost/TarodCheck](http://localhost/TarodCheck). La primera conexión a la API importa automáticamente los datos iniciales de `data/db.json`; después, las lecturas y cambios se guardan en MySQL/MariaDB.

La configuración local de `config.php` usa el usuario predeterminado `root` sin contraseña de XAMPP. Es solo para desarrollo local: en un dominio público la API exige configuración de producción y no acepta `root`. Antes de publicar el sitio, configura las credenciales del usuario dedicado en `config.local.php` o mediante variables de entorno `TAROT_DB_HOST`, `TAROT_DB_PORT`, `TAROT_DB_NAME`, `TAROT_DB_USER` y `TAROT_DB_PASSWORD`. La base conserva el documento de datos de la aplicación como JSON para mantener la compatibilidad con las funciones existentes.

El panel guarda en ese documento las citas, reseñas, servicios, pasos de reserva, horarios y datos del negocio. Los datos iniciales no incluyen citas de demostración; las bases ya inicializadas no se modifican automáticamente para preservar las citas existentes. Al cargar datos, las instalaciones que aún tengan el nombre predeterminado anterior se actualizan a **Pura Luz**; los nombres personalizados se conservan. Las citas usan identificadores internos únicos que no se muestran como folio; las referencias antiguas `TR-` se actualizan al cargar los datos y las nuevas citas reciben su identificador del servidor y quedan pendientes hasta que el administrador confirme el pago. Las eliminaciones de citas y reseñas también se sincronizan con la API de MySQL. La API pública solo expone los datos mínimos de disponibilidad para reservar; teléfonos, correos, notas e identificadores de citas requieren una sesión de administrador.

Apache bloquea el acceso directo a `config.php`, al directorio de datos y al esquema SQL, y envía encabezados contra el encuadre del sitio y la filtración innecesaria del referente. Mantén Apache actualizado y sirve el sitio mediante HTTPS en producción.

### Preparación para Hostinger

La aplicación requiere **PHP 8.1 o posterior** con las extensiones `PDO` y `pdo_mysql`, y una base MySQL/MariaDB con InnoDB y soporte JSON. En el panel de Hostinger verifica esos requisitos y activa SSL/HTTPS antes de publicar. No se necesitan Composer, Node.js ni un proceso de compilación.

1. En hPanel crea una base de datos MySQL y un usuario dedicado; asigna a ese usuario únicamente los permisos necesarios de esa base (`SELECT`, `INSERT`, `UPDATE`, `DELETE` y `CREATE`). No uses `root`.
2. Prepara `config.local.php` en la raíz del sitio a partir de este formato, sustituyendo cada valor con los datos de hPanel. **No subas este archivo desde una copia que contenga secretos ni lo compartas**:

   ```php
   <?php
   return [
       'host' => 'HOST_MYSQL_DE_HOSTINGER',
       'port' => '3306',
       'database' => 'NOMBRE_DE_LA_BASE',
       'username' => 'USUARIO_DE_LA_BASE',
       'password' => 'CONTRASENA_DE_LA_BASE',
       'initial_admin_pin' => 'PIN_SEGURO_DE_6_DIGITOS',
       'admin_email' => 'paulinaescalante.puraluz@gmail.com',
       'smtp_host' => 'smtp.gmail.com',
       'smtp_port' => '587',
       'smtp_username' => 'CUENTA_GMAIL_EMISORA',
       'smtp_password' => 'CONTRASENA_DE_APLICACION_GMAIL'
   ];
   ```

   El PIN no puede ser una secuencia ni seis dígitos repetidos. Crea este archivo desde el administrador de archivos de Hostinger después de subir el código y limita sus permisos a lectura/escritura del propietario (por ejemplo, `600` si el panel permite configurarlo). El modo local se detecta únicamente al servir desde `localhost`; en otros dominios la aplicación exige configuración de producción válida y rechaza credenciales `root` o incompletas. También puedes definir los valores mediante variables de entorno `TAROT_*`; estas tienen prioridad sobre `config.local.php`.
3. Sube el contenido del proyecto a `public_html` (incluidos `.htaccess`, `api.php`, `config.php`, `data/`, `database/`, `css/`, `js/` e `images/`). No subas copias de seguridad, exportaciones SQL ni credenciales. El `.htaccess` deniega el acceso web a `config.php`, `config.local.php`, archivos `.env`, SQL, logs y copias de seguridad; `data/` y `database/` también tienen reglas propias de acceso denegado. No elimines estas reglas.
4. Importa `database/schema.sql` en la base de datos de Hostinger desde phpMyAdmin, usando la base creada en hPanel. El archivo crea las tablas en la base seleccionada y no intenta crear o seleccionar una base con nombre fijo.
5. Activa en hPanel la redirección a HTTPS. Comprueba que `https://tu-dominio/api.php?action=ping` responde correctamente y que no se puede descargar `config.php`, `config.local.php`, `data/db.json` ni `database/schema.sql`. Después prueba una reserva y el acceso administrativo. El pin de inicio configurado se aplica cuando la API inicializa una base nueva; protege también cualquier migración/importación de datos existentes.

La aplicación depende de que Apache/LiteSpeed aplique `.htaccess` (incluido `mod_headers`) y de que PHP reciba HTTPS para marcar la cookie administrativa como segura. Si el plan o el dominio todavía no están contratados, los nombres de host, credenciales y capacidades disponibles se completarán con los datos reales del hPanel antes de subir el sitio.

### Recuperación del PIN del administrador por correo
La recuperación envía un código de un solo uso a `paulinaescalante.puraluz@gmail.com`. Para habilitar el envío con Gmail:

1. Activa la verificación en dos pasos de la cuenta de Gmail emisora y genera una contraseña de aplicación.
2. En Windows, agrega `TAROT_SMTP_PASSWORD` con la contraseña de aplicación. Por defecto se usa `paulinaescalante.puraluz@gmail.com` como remitente y destinatario; define `TAROT_SMTP_USER` si el remitente es otra cuenta Gmail y `TAROT_ADMIN_EMAIL` si quieres cambiar el correo que recibe el código.
3. Reinicia Apache desde el panel de XAMPP para que PHP reciba las variables.
4. En el panel, selecciona **Olvidé mi PIN**, solicita el código y escribe el código recibido junto con un PIN nuevo de 6 dígitos.

No uses la contraseña normal de Gmail ni compartas la contraseña de aplicación en el chat. Los códigos vencen en 10 minutos y los intentos están limitados. Los inicios de sesión se validan en el servidor; las escrituras administrativas requieren una sesión autorizada y el PIN se guarda con hash. En una instalación nueva no hay PIN predeterminado: configura `TAROT_ADMIN_PIN` con un PIN seguro de seis dígitos antes de inicializar la base, o utiliza la recuperación por correo. Si la base todavía tiene el PIN antiguo `1234`, al iniciar sesión desde `localhost` se pedirá reemplazarlo por un PIN nuevo; desde conexiones remotas ese PIN antiguo queda bloqueado. También puedes definir `TAROT_ADMIN_PIN` en Windows y reiniciar Apache para reemplazar el PIN antiguo por el configurado.

Si Apache y MySQL ya están iniciados, también puedes abrir las páginas en:
- **Flujo de reservas:** [http://localhost/TarodCheck/booking.html](http://localhost/TarodCheck/booking.html)
- **Panel administrativo:** [http://localhost/TarodCheck/admin.html](http://localhost/TarodCheck/admin.html)

---

## 🔑 Acceso administrativo

No se distribuye un PIN predeterminado. Configúralo con `TAROT_ADMIN_PIN` al instalar o cámbialo desde *Datos del Negocio* una vez que inicies sesión.
