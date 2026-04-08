# Briefing Unificado (ES): GW, ICA, DataConversion y SDKs

## 1) Objetivo del documento

Este documento sirve para:

1. Explicar el modelo a dirección de proyecto en lenguaje no técnico.
2. Dar trazabilidad de seguridad para auditoría.
3. Dar contexto operativo a desarrolladores que no conocen DID, VC, Gaia-X o Data Space Protocol.

No sustituye OpenAPI ni especificaciones legales. Es una guía de alineación funcional y de seguridad.

## 2) Mapa simple de componentes

## 2.1 GW API (Gateway)

Responsabilidad principal:

1. Operación diaria del tenant/organización.
2. Mensajería e intercambio de datos.
3. Gestión de profesionales, permisos y flujos operativos.
4. Gestión del índice de datos del individuo (incluyendo casos de emergencia según política).

## 2.2 DataConversion Service API

Responsabilidad principal:

1. Ingesta y normalización de datos.
2. Alimentación de gemelos digitales.
3. Transformaciones y procesos de conversión.

## 2.3 ICA API (Identity and Compliance Authority)

Responsabilidad principal:

1. Alta y verificación de organización mediante contrato de adhesión firmado.
2. Emisión de credenciales verificables (VCs) de organización y representante.
3. Generación/publicación del DID Document.
4. Registro de evidencias (anclaje/trazabilidad) en red de confianza (por ejemplo blockchain según despliegue).

## 2.4 SDKs (Node/Python/Frontend)

Responsabilidad principal:

1. Facilitar consumo de APIs desde backend Node/Python y apps frontend.
2. Orquestar flujos asíncronos (`submit` + `poll` por `thid`).
3. Manejar autenticación técnica (DCR + emisión de tokens) y contratos de transporte.

Resumen:

1. APIs = capacidad de negocio.
2. SDKs = forma segura y consistente de llamar esas APIs.
3. ICA = identidad y cumplimiento de onboarding.

## 3) Vocabulario mínimo (sin jerga)

1. `Controller`: persona responsable de la organización.
2. `API key` o `Invitation code`: credencial inicial para activar un cliente (backend o app).
3. `client_id`: identificador técnico que el sistema usa en DCR/token (en nuestro diseño suele derivar de API key o invitation code).
4. `DCR`: registro dinámico de cliente; vincula identidad técnica y clave pública.
5. `id_token`: identidad emitida por IdP (Google u otros) para autenticar a una persona.
6. `access token (Bearer)`: token de acceso con permisos concretos para endpoints.
7. `VC`: credencial verificable con evidencias.
8. `DID Document`: documento público de claves y servicios de una identidad descentralizada.

## 4) Flujo unificado de acceso (visión de negocio)

## 4.1 Fase humana (controller)

1. El controller autentica con su IdP.
2. Intercambia identidad en `/_exchange` para obtener contexto autorizado.
3. Crea credenciales iniciales para clientes:
- backend: API key,
- profesional/usuario: invitation code.

## 4.2 Fase técnica (backend o wallet de app)

1. Cliente usa `client_id` (API key o invitation code) para DCR.
2. DCR vincula `client_id` con clave pública técnica del cliente.
3. Cliente solicita Bearer con permisos granulares para endpoint específico.

## 4.3 Fase operativa (consumo API)

1. Cliente llama endpoints de negocio con Bearer.
2. El permiso es granular por endpoint y acción.
3. En nuestro diseño, la acción de operación se expresa al final del endpoint (`.../<action>`).

## 5) Relación entre ICA y GW/DataConversion

## 5.1 Onboarding de organización en ICA

1. Verificación contractual (adhesión firmada).
2. Emisión de VCs.
3. Creación/publicación DID Document.
4. Evidencia trazable para confianza inter-organizacional.

## 5.2 Operación posterior en GW/DataConversion

1. Con identidad ya establecida, el tenant opera en GW y DataConversion.
2. Individuos activan su índice de datos en GW con lógica similar de control de acceso.
3. Se definen permisos de emergencia con reglas explícitas y auditables.

## 6) Encaje con Gaia-X y Data Space Protocol (nivel práctico)

En términos prácticos, el encaje es:

1. Identidad verificable: DID + VCs.
2. Trazabilidad de confianza: evidencias verificables y gobernanza de acceso.
3. Interoperabilidad contractual: APIs tipadas con autenticación y autorización granular.
4. Separación de roles: autoridad de identidad/compliance (ICA) vs operación de datos (GW/DataConversion).

Para auditoría, este documento se debe leer junto con:

1. OpenAPI de cada servicio.
2. Políticas de seguridad por entorno (`strict|compat|demo`).
3. ADRs técnicos de custodia de claves y modo de transporte (`didcomm-plain`, `didcomm-signed`, `didcomm-encrypted`).

## 7) Mensaje para reunión (no técnica)

Texto breve sugerido:

"Tenemos tres capas separadas. ICA valida y da identidad confiable a organizaciones y personas mediante credenciales verificables. GW y DataConversion operan los datos del día a día del tenant. Los SDKs conectan aplicaciones y backends a esas APIs de forma segura, con un flujo estándar: primero identidad humana para autorizar, luego registro técnico del cliente, y finalmente tokens de acceso granulares por endpoint y acción."

## 8) Checklist para auditor

1. ¿Se separa claramente identidad/compliance (ICA) de operación (GW/DataConversion)?
2. ¿El flujo distingue autenticación humana de autenticación técnica?
3. ¿Existe DCR con vínculo de clave pública y `client_id`?
4. ¿Los Bearer son de permisos granulares por endpoint/acción?
5. ¿Hay trazabilidad de credenciales/evidencias y políticas de revocación/rotación?
6. ¿Los modos de transporte y seguridad están definidos por entorno?

## 9) Prompt reutilizable (ES)

Usa este prompt para pedir a un agente o a un equipo un documento equivalente:

"Redacta una explicación ejecutiva y técnica, en español claro, sobre el ecosistema de servicios de un data space sanitario: ICA (identidad/compliance), GW (operación clínica/organizativa) y DataConversion (normalización y gemelos digitales), separando explícitamente API de negocio y SDK de integración. Incluye flujo completo: id_token de IdP para controller, `_exchange`, creación de API key/invitation code, DCR con `client_id`, emisión de Bearer granular por endpoint (`.../<action>`), rol de DID Document y VCs, y evidencias trazables en red de confianza. Añade una versión para dirección, otra para auditoría y otra para desarrolladores sin experiencia en DID/VC."
