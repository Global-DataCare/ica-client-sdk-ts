# Documento Marco (ES): Identidad, Operación y Acceso en el Data Space

## 1. Propósito y alcance

Este documento define un marco único, comprensible y auditable para:

1. Dirección de proyecto (visión de negocio y decisión).
2. Auditoría de seguridad/compliance (controles verificables).
3. Desarrollo (flujo técnico y responsabilidades por servicio).

El alcance cubre:

1. `ICA` (identidad y cumplimiento de onboarding).
2. `GW` (operación de mensajería y gestión clínica/organizativa).
3. `DataConversion` (normalización y producción de gemelos digitales).
4. Bibliotecas de integración (Node/Python/backend y frontend).

## 1.1 Cómo usar este documento

Es un único documento base. No hay versión "de negocio" y otra "técnica".

Lectura recomendada:

1. Para dirección de proyecto: secciones 1, 2, 3 y 6.
2. Para auditoría: secciones 4, 6 y 7.
3. Para desarrollo: secciones 3, 4, 5 y 8.

Regla de redacción aplicada:

1. cada término técnico aparece acompañado de una explicación funcional,
2. cuando se usa una etiqueta estándar (`thid`, `id_token`, `client_id`), se explica su significado operativo.

## 2. Separación de responsabilidades

## 2.1 ICA (Identity and Compliance Authority)

ICA es la autoridad de identidad y cumplimiento. Sus funciones son:

1. Verificar la adhesión contractual de la organización.
2. Emitir credenciales verificables (VC) de organización y representante/controlador.
3. Generar/publicar material de identidad (DID Document y claves públicas asociadas).
4. Mantener evidencias verificables de onboarding y estado de confianza.

## 2.2 GW (Gateway API)

GW es la capa operativa del tenant. Sus funciones son:

1. Gestionar profesionales y roles de la organización alojada.
2. Ejecutar mensajería e intercambio operativo entre actores.
3. Gestionar permisos y políticas de acceso (incluido modo emergencia).
4. Soportar activación y operación del índice de datos de individuo.

## 2.3 DataConversion Service API

DataConversion es la capa de transformación y publicación técnica. Sus funciones son:

1. Ingerir datos fuente.
2. Normalizar/mapear datos clínicos y operativos.
3. Publicar datasets/colecciones derivados.
4. Alimentar gemelos digitales.

## 2.4 Bibliotecas de integración

Las bibliotecas de integración no sustituyen las APIs. Su función es:

1. Encapsular autenticación/autorización técnica.
2. Estandarizar el patrón asíncrono de "envío inicial + consulta posterior de estado" usando un identificador del hilo de mensajes entre cliente de software y servicio API (`thid`).
3. Reducir errores de integración y asegurar trazabilidad.

## 3. Modelo de identidad y acceso

## 3.1 Fase humana (controller/representante)

1. El controller se autentica con un proveedor de identidad confiable (por ejemplo Google u otro OIDC).
2. Se obtiene una credencial de identidad (`id_token`).
3. Se ejecuta el intercambio en `/_exchange` para contexto autorizado en el ecosistema.
4. El controller puede:
- crear API keys para backend, o
- crear invitation codes para profesionales/usuarios.

## 3.2 Fase técnica (wallet de backend o wallet de app)

1. El cliente técnico utiliza `client_id` (API key o invitation code según flujo).
2. Ejecuta DCR (`/_dcr`) para vincular identidad técnica con clave pública.
3. Solicita una credencial de acceso granular para un endpoint concreto (según el perfil de seguridad habilitado).
4. Invoca endpoint de negocio con credencial de acceso tipo Bearer en la cabecera de autorización.

## 3.3 Regla de diseño de endpoints

En el diseño actual, la operación suele expresarse al final del path como `<action>`.
Esto facilita:

1. autorización granular por operación,
2. trazabilidad por acción,
3. pruebas de seguridad por ruta concreta.

## 4. Perfiles de autenticación

## 4.1 Perfil custom del ecosistema (`identity-exchange.v1`)

Secuencia:

1. `/_dcr`
2. `/_code`
3. `/_token`
4. `/_exchange`

Características:

1. Flujo asíncrono `submit/poll`.
2. `client_id` técnico obligatorio por especificación.
3. DCR es vínculo técnico, no validación humana.

## 4.2 Perfil estándar SMART Backend Services (OAuth2)

Secuencia estándar:

1. `client_credentials`
2. `private_key_jwt` (proof of possession)

Características:

1. No usa la cadena custom `/_dcr/_code/_token/_exchange`.
2. Adecuado para escenarios SMART-on-FHIR backend-to-backend.
3. Requiere registro/configuración compatible del authorization server.

## 4.3 Regla de interoperabilidad

Ambos perfiles pueden coexistir, pero no deben mezclarse en la misma transacción.

## 5. FHIR, resumen interoperable e índice de secciones del gemelo digital

## 5.1 SMART on FHIR

Se usa para autorización de acceso a recursos FHIR con permisos granulares.
La credencial de acceso debe estar acotada por:

1. endpoint/acción,
2. ámbito clínico,
3. política del tenant.

## 5.2 Resumen interoperable (IPS) e índice de secciones (Composition)

En este marco:

1. `Composition` actúa como índice funcional del gemelo digital (secciones y referencias a documentos/recursos).
2. Cada sección puede referenciar documentos/recursos en diferentes data providers.
3. `IPS` se interpreta como resumen interoperable que consume ese índice.
4. Este patrón de "índice + referencias" es aplicable fuera del sector salud cuando existe un sujeto y múltiples fuentes documentales.

## 5.3 Datasets DCAT3 y perfiles FHIR

Para catálogo de datos:

1. cada perfil/colección funcional (por ejemplo `vital signs`) debe modelarse como dataset diferenciado,
2. aunque ciertos datos compartan tipo base FHIR (por ejemplo `Observation`), el perfil funcional se trata como activo distinto.

Implicación:

1. el catálogo DCAT3 debe reflejar granularidad semántica real,
2. no solo el tipo técnico base.

## 6. Gaia-X / Data Space Protocol: controles operativos

## 6.1 Verificación de confianza (Clearing House)

Antes de conceder acceso operativo, el sistema debe verificar:

1. validez de VC de `Organization` y `PractitionerRole` (o equivalente),
2. vigencia temporal,
3. estado de revocación/suspensión,
4. cadena de confianza del emisor,
5. correspondencia de clave pública activa.

## 6.2 Regla de `kid` y thumbprint

Control recomendado:

1. resolver la clave pública activa desde DID Document/JWKS,
2. verificar que `kid` corresponde al thumbprint esperado (RFC 7638) según política,
3. rechazar credenciales o credenciales de acceso con `kid` no reconocido, revocado o fuera de política.

## 6.3 Resultado esperado

Solo tras estas validaciones se permite:

1. emisión/aceptación de credencial de acceso granular,
2. acceso a endpoints operativos,
3. consumo de datasets clínicos.

## 7. Matriz de controles para auditoría

## 7.1 Identidad y segregación de funciones

1. ICA separado funcionalmente de GW/DataConversion.
2. Proceso humano (controller) separado del proceso técnico (wallet backend/app).
3. Evidencia de onboarding y estado de confianza trazable por tenant.

## 7.2 Acceso técnico y criptografía

1. DCR con vínculo `client_id` + clave pública técnica.
2. Emisión de credencial de acceso Bearer con permisos granulares por endpoint/acción.
3. Control de rotación/revocación de claves y credenciales.
4. Verificación de `kid`/thumbprint y estado de confianza en Clearing House.

## 7.3 Interoperabilidad de datos

1. SMART on FHIR para acceso autorizado.
2. Uso de resumen interoperable (IPS) e índice de secciones (Composition) para indexación y navegación clínica interoperable.
3. DCAT3 con datasets por perfil funcional, no solo por tipo base.

## 8. Modelo de integración para equipos de desarrollo

## 8.1 Qué implementa el backend consumidor

1. Configuración de endpoints y credenciales.
2. Custodia de claves (wallet/KMS/HSM).
3. Selección del perfil de autenticación (`identity-exchange.v1` o SMART backend estándar).
4. Política de reintentos, logging y auditoría.

## 8.2 Qué aporta la biblioteca de integración

1. Estructuras de entrada/salida claras para reducir errores.
2. Gestión secuencial del proceso de autenticación y acceso.
3. Gestión del identificador del hilo de mensajes (`thid`), de la URL de consulta de estado devuelta por el servidor (cabecera HTTP `Location`) y del tiempo mínimo de espera recomendado antes de volver a consultar estado (cabecera HTTP `Retry-After`).
4. Conectores para distintos entornos de ejecución.

## 8.3 Reglas de implementación

1. No mezclar el contenido de negocio con la lógica criptográfica de firma/cifrado del sobre de transporte.
2. Mantener distinción explícita entre:
- identidad humana (credencial de identidad + intercambio de identidad),
- identidad técnica (DCR + prueba de posesión de clave + client credentials).
3. Validar siempre estado de confianza antes de habilitar operación sensible.

## 9. Criterios para documentos derivados

Cuando este documento se reutilice para presentaciones, propuestas o anexos, se deben mantener estos mínimos:

1. separación ICA (identidad/compliance) vs GW/DataConversion (operación de datos),
2. distinción explícita entre identidad humana e identidad técnica,
3. descripción de perfiles de autenticación sin mezclar flujos (`identity-exchange.v1` y SMART backend estándar),
4. control de confianza Gaia-X/Clearing House con validación de vigencia, revocación y `kid`/thumbprint (RFC 7638),
5. trazabilidad de autorización granular por endpoint/acción,
6. tratamiento de `Composition` como índice y de IPS como resumen interoperable,
7. catalogación DCAT3 por perfil funcional de datos.
