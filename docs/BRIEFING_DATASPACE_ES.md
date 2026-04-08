# Documento Base (ES): Identidad, Acceso y Operación de Datos en el Data Space

## 1. Qué resuelve este documento

Este documento explica, en un único texto, cómo funciona el ecosistema para:

1. dirección de proyecto,
2. auditoría de seguridad y cumplimiento,
3. desarrollo de software.

Objetivo: que cualquier persona entienda quién hace qué, en qué orden, y con qué controles.

## 2. Componentes y responsabilidad de cada uno

## 2.1 ICA (autoridad de identidad y cumplimiento)

ICA se encarga de:

1. validar la adhesión contractual de una organización,
2. emitir credenciales verificables de organización y representante,
3. publicar la identidad técnica (documento DID y claves públicas),
4. mantener evidencia verificable del alta y estado de confianza.

## 2.2 GW (nodo operador para organizaciones alojadas)

GW es la implementación del nodo operador multiorganización. Se encarga de:

1. operar la mensajería y procesos de la organización alojada,
2. gestionar profesionales, permisos y acceso de emergencia,
3. gestionar la activación y uso del índice de datos de sujetos.

## 2.3 DataConversion (servicio de transformación y gemelos digitales)

DataConversion se encarga de:

1. recibir datos de diferentes sistemas,
2. transformarlos y normalizarlos,
3. generar y mantener gemelos digitales por organización alojada,
4. publicar conjuntos de datos catalogables.

## 2.4 Biblioteca de integración (Node/Python/frontend)

La biblioteca de integración no reemplaza la API. Su papel es:

1. simplificar llamadas seguras a los servicios,
2. gestionar el proceso "enviar petición y consultar resultado",
3. reducir errores de integración y mejorar trazabilidad.

## 3. Historia de usuario completa (de extremo a extremo)

## 3.1 Alta de una organización

1. Un representante legal firma el proceso de adhesión.
2. ICA valida y emite credenciales verificables.
3. ICA publica identidad técnica y evidencia verificable.
4. La organización queda habilitada para alojarse y operar en GW/DataConversion.

## 3.2 Activación de un cliente de software (backend o app)

1. El representante entra con su proveedor de identidad habitual (por ejemplo Google, eID u otro).
2. El sistema obtiene una credencial de identidad de esa persona.
3. En ICA y DataConversion se ejecuta un intercambio de identidad administrativa (`_exchange`) para autorizar acciones de administración del controller.
4. El representante crea:
- una API key para un backend, o
- un código de invitación para un profesional/app.

## 3.3 Vinculación técnica del cliente o instancia de software

1. El cliente de software presenta su identificador técnico (`client_id`), que en este diseño proviene de API key o código de invitación.
2. Se registra la vinculación técnica (DCR o Dynamic Client Registration) entre ese `client_id` y la clave pública del cliente de software (wallet).
3. Desde ese momento, el cliente puede solicitar credenciales de acceso por operación concreta.

## 3.4 Operación diaria

1. El cliente solicita credencial de acceso para una operación concreta de la API.
2. Si cumple validaciones de confianza, recibe credencial de acceso.
3. Invoca el endpoint de negocio autorizado.

## 3.5 Regla explícita por servicio

1. GW: no depende del `_exchange` humano de administración para operación diaria; usa credenciales de acceso técnicas por operación.
2. ICA: puede usar `_exchange` humano para funciones de administración (controller).
3. DataConversion: puede usar `_exchange` humano para funciones de administración (controller).

## 4. Formas de acceso: intercambio humano y caminos técnicos

Hay tres piezas que deben distinguirse para no mezclar conceptos:

1. intercambio humano de administración,
2. camino técnico propio del ecosistema,
3. camino técnico estándar SMART backend.

## 4.1 Intercambio humano de administración (`_exchange` en ICA/DataConversion)

Quién lo usa:

1. controller/admin (persona) para tareas de administración.

Para qué sirve:

1. obtener autorización administrativa tras autenticación humana,
2. crear API keys o invitaciones,
3. operar endpoints administrativos de ICA/DataConversion.

Qué no es:

1. no es DCR,
2. no es prueba de posesión técnica del backend,
3. no es el camino principal de operación diaria en GW.

## 4.2 Camino técnico propio del ecosistema (`identity-exchange.v1`)

Quién lo usa:

1. servicios que siguen la secuencia técnica definida por este ecosistema.

Quién lo ejecuta:

1. el cliente de software (backend/app), normalmente a través de la biblioteca de integración.

Secuencia técnica:

1. `/_dcr` (vinculación técnica del cliente),
2. `/_code`,
3. `/_token`,
4. `/_exchange` técnico.

Cómo se entiende:

1. `/_dcr` no valida a la persona; valida la identidad técnica del software,
2. el identificador técnico (`client_id`) es obligatorio por diseño de esta secuencia,
3. el proceso es asíncrono: primero se envía la petición y luego se consulta el estado con el identificador del hilo de mensajes,
4. el `/_exchange` de este camino es técnico y no debe confundirse con el `_exchange` humano administrativo.

## 4.3 Camino estándar SMART Backend Services

Quién lo usa:

1. integraciones que siguen el estándar SMART on FHIR para backend a backend.

Quién lo ejecuta:

1. el backend cliente, contra un servidor de autorización compatible.

Secuencia:

1. `client_credentials`,
2. `private_key_jwt` (prueba de que el cliente controla su clave privada).

Diferencia clave:

1. este camino no usa `/_dcr/_code/_token/_exchange`.
2. este camino aplica prueba de posesión de clave en la solicitud de credencial de acceso.

## 5. Historia de datos del sujeto (IPS + Composition) y gemelo digital

En este documento usamos "historia de datos del sujeto" para hablar de la vista interoperable del sujeto.

El sujeto puede ser inicialmente una persona o un animal en el dominio One Health.

## 5.1 Qué papel tiene `Composition`

`Composition` funciona como índice de secciones y referencias:

1. enumera qué bloques de información componen la historia,
2. apunta a documentos o recursos que pueden residir en distintos proveedores de datos.

## 5.2 Qué papel tiene IPS

IPS es un resumen interoperable construido a partir del índice y sus referencias.

Interpretación práctica:

1. `Composition` organiza y referencia,
2. IPS resume de forma intercambiable entre sistemas.

## 5.3 Relación con DataConversion

DataConversion puede transformar esa historia de datos a distintos formatos/versiones:

1. FHIR R4, FHIR R5 u otros modelos,
2. versiones derivadas mediante reglas de transformación sobre metadatos,
3. salida específica para el consumidor final manteniendo trazabilidad del origen.

## 6. Catálogo de datos (DCAT3) y granularidad

Regla de catálogo:

1. cada perfil funcional de datos debe tratarse como conjunto de datos propio,
2. aunque dos perfiles compartan el mismo tipo base técnico.

Ejemplo:

1. "signos vitales" puede usar recursos de tipo `Observation`,
2. pero se cataloga como conjunto funcional distinto por su semántica y uso.

## 7. Controles Gaia-X / Clearing House (qué se verifica antes de dar acceso)

Antes de permitir acceso operativo, se valida:

1. vigencia de credenciales de organización y profesional,
2. estado de revocación/suspensión,
3. cadena de confianza del emisor,
4. validez de la clave pública activa.

Además, se valida el ID normalizado de clave pública:

1. se obtiene la clave pública activa desde DID Document o JWKS,
2. se compara su ID de clave pública normalizado (`kid`) con el valor esperado según RFC 7638 (thumbprint),
3. se rechaza acceso si esa clave no es válida, está revocada o fuera de política.

## 8. Términos clave (traducción funcional)

1. `id_token`: credencial de identidad emitida por un proveedor de identidad.
2. `client_id`: identificador técnico del cliente de software (derivado de API key o invitación según flujo).
3. `DCR`: registro de cliente de software y su clave pública.
4. `Bearer`: credencial de acceso que autoriza una operación concreta.
5. `thid`: identificador del hilo de mensajes entre cliente de software y servicio API.
6. `Location` (cabecera HTTP): URL de consulta de estado devuelta por el servidor.
7. `Retry-After` (cabecera HTTP): tiempo mínimo recomendado antes de volver a consultar estado.
8. `kid`: ID normalizado de la clave pública usada para verificar firmas.

## 9. Criterios obligatorios para documentos derivados

Si este texto se usa como base para presentaciones o anexos, siempre debe conservar:

1. separación ICA (identidad/cumplimiento) vs GW/DataConversion (operación),
2. separación entre validación humana e identidad técnica del software,
3. explicación de los dos caminos de autenticación técnica sin mezclarlos,
4. separación explícita entre `_exchange` humano (administración ICA/DataConversion) y `_exchange` técnico (flujo `identity-exchange.v1`),
5. validaciones de confianza de credenciales y claves públicas (incluido `kid`),
6. autorización granular por operación de API,
7. explicación de historia de datos del sujeto (índice + resumen + transformaciones),
8. catalogación DCAT3 por perfil funcional.
