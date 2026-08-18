# Propuesta ejecutiva para la aplicación móvil OGC

## 1. Resumen ejecutivo

Se propone desarrollar una aplicación móvil de OGC para teléfonos y tabletas iOS y Android, enfocada inicialmente en el personal que trabaja en campo.

El objetivo principal es que el equipo pueda consultar y registrar información aun cuando la conexión a internet sea limitada o inexistente. La aplicación se sincronizará con la plataforma actual cuando el dispositivo recupere la conexión.

La propuesta se divide en tres etapas para entregar valor de manera gradual y reducir el riesgo del proyecto:

1. **Aplicación para operación en campo:** tareas, bitácora, fotografías, solicitudes de información (RFI), requisiciones, planos, programa de obra, documentos y notificaciones.
2. **Ampliación operativa:** autorizaciones, permisos, contratos, proveedores, reportes y operaciones financieras frecuentes.
3. **Funciones administrativas completas:** presupuestos, pagos, ingresos, flujo, análisis financiero, ventas, usuarios y configuración.

Con un desarrollador de tiempo completo, la primera versión se enviaría a las tiendas en la **semana 31** y podría estar disponible al público entre las **semanas 32 y 33**, dependiendo de la revisión de Apple y Google. La cobertura funcional completa se estima alrededor de la **semana 53**, equivalente a aproximadamente 12 meses.

## 2. Necesidad que atiende

El personal de obra necesita registrar avances y consultar información desde el lugar de trabajo, donde la conectividad puede ser inestable. Una solución que dependa permanentemente de internet puede provocar retrasos, registros incompletos o trabajo duplicado.

La aplicación móvil busca resolver principalmente lo siguiente:

- Consultar información importante sin conexión.
- Registrar tareas, avances, bitácoras, fotografías, RFIs y requisiciones desde campo.
- Descargar y revisar planos y documentos.
- Guardar temporalmente los cambios y sincronizarlos después.
- Evitar registros duplicados o pérdida de información durante fallas de red.
- Mantener separados y protegidos los datos de cada empresa y proyecto.
- Informar a los usuarios mediante notificaciones sobre pendientes y cambios relevantes.

## 3. Alcance por etapas

| Etapa | Periodo estimado | Resultado para la organización |
|---|---:|---|
| 1. Aplicación de campo | Semanas 1–31 | Aplicación lista para enviarse a App Store y Play Store, con las funciones necesarias para el trabajo diario en obra. |
| Revisión de tiendas | 1–2 semanas externas | Validación de Apple y Google antes de la publicación. Este plazo no depende totalmente del equipo de desarrollo. |
| 2. Operación ampliada | Semanas 32–41 | Incorporación de autorizaciones, permisos, contratos, proveedores, reportes y operaciones financieras frecuentes. |
| 3. Administración completa | Semanas 42–53 | Incorporación de presupuestos, pagos, ingresos, análisis financiero, ventas, usuarios y configuración. |

## 4. Entregables principales de la primera versión

La primera versión incluirá:

- Acceso seguro y selección de empresa o proyecto.
- Funcionamiento sin conexión y sincronización posterior.
- Inicio con indicadores y pendientes.
- Administración de tareas.
- Bitácora de obra con fotografías y documentos.
- RFIs o solicitudes de información.
- Requisiciones.
- Consulta de planos y anotaciones.
- Consulta del programa de obra y captura de avances.
- Biblioteca de documentos.
- Notificaciones de asuntos relevantes.
- Publicación para iOS y Android.

Las funciones administrativas y financieras de mayor complejidad continuarán disponibles en la plataforma web hasta que sean incorporadas en las etapas posteriores.

## 5. Hitos para seguimiento administrativo

| Semana | Hito verificable |
|---:|---|
| 5 | Acceso seguro, manejo de varias empresas y navegación básica. |
| 8 | Funcionamiento sin conexión validado de principio a fin. |
| 15 | Versión interna con Tareas y Bitácora operativas. |
| 21 | Versión de prueba en campo con RFIs y Requisiciones. |
| 25 | Consulta y manejo de Planos. |
| 28 | Funciones de la primera versión terminadas. |
| 30 | Versión candidata aprobada internamente. |
| 31 | Envío a App Store y Play Store. |
| 32–33 | Publicación estimada, sujeta a aprobación externa. |
| 53 | Cobertura funcional completa estimada. |

## 6. Recursos y referencia presupuestal

La estimación considera:

- Un desarrollador de tiempo completo, 40 horas por semana.
- El mismo recurso realiza análisis, diseño de interfaz, programación, pruebas y publicación.
- Reutilización de los servicios actuales de autenticación, datos e infraestructura.
- Desarrollo para iOS y Android con una base tecnológica compartida.

El calendario detallado representa aproximadamente:

- **1,240 horas** hasta el envío de la primera versión a tiendas: 31 semanas × 40 horas.
- **2,120 horas** hasta completar las tres etapas: 53 semanas × 40 horas.
- **160 a 240 horas adicionales de reserva** si se incorpora el margen recomendado de 4 a 6 semanas.

El presupuesto puede calcularse multiplicando estas horas por la tarifa correspondiente. Estas cifras no incluyen cambios importantes de alcance, vacaciones, incidencias externas ni una reestructuración mayor de la plataforma actual.

## 7. Riesgos y condiciones relevantes

| Riesgo o condición | Impacto posible | Medida de control propuesta |
|---|---|---|
| Cambios de alcance durante el desarrollo | Aumento del plazo y del costo | Sustituir una función por otra de esfuerzo similar o autorizar una ampliación del calendario. |
| Conectividad deficiente en obra | Registros incompletos o retrasos | Guardado local, reintentos automáticos y sincronización controlada. |
| Archivos y planos pesados | Lentitud y consumo de almacenamiento | Descargas bajo demanda, compresión y almacenamiento temporal administrado. |
| Conflictos al editar sin conexión | Información duplicada o contradictoria | Reglas de sincronización, operaciones sin duplicados y validación de conflictos. |
| Revisión de Apple y Google | Retraso de 1 a 2 semanas o solicitud de ajustes | Preparar con anticipación privacidad, permisos, fichas y pruebas cerradas. |
| Dependencia de una sola persona | Riesgo ante ausencias y menor capacidad de trabajo paralelo | Reservar 4–6 semanas o incorporar un segundo desarrollador y apoyo de calidad. |
| Datos de distintas empresas | Riesgo de confidencialidad | Pruebas obligatorias de permisos y separación de información antes de publicar. |

## 8. Comparación: aplicación móvil frente a PWA

Una **PWA** es una aplicación web adaptada para instalarse desde el navegador y utilizar algunas funciones del dispositivo. Puede trabajar sin conexión y recibir notificaciones en ciertos entornos, pero su comportamiento depende más del sistema operativo y del navegador.

| Criterio | Aplicación móvil iOS/Android | PWA | Implicación para OGC |
|---|---|---|---|
| Inversión inicial | Mayor, por la integración móvil, pruebas en dispositivos y publicación en tiendas. | Generalmente menor si se reutiliza una parte importante de la plataforma web. | La PWA puede ser atractiva si la prioridad principal es reducir el costo inicial. |
| Tiempo de salida | Envío estimado en la semana 31 y publicación en semanas 32–33. | Potencialmente menor, pero requiere una estimación específica; el modo sin conexión y la sincronización siguen siendo trabajos relevantes. | Una PWA básica puede salir antes, pero igualar todo el alcance de campo reduce esa ventaja. |
| Instalación y acceso | Se descarga desde App Store o Play Store y queda visible como una aplicación convencional. | Se abre mediante un enlace y opcionalmente se agrega a la pantalla de inicio. | La PWA facilita el acceso inicial; la app suele ser más familiar como herramienta corporativa instalada. |
| Funcionamiento sin conexión | Mayor control sobre datos locales, archivos, reintentos y sincronización. | Es posible, pero la capacidad y el comportamiento pueden variar entre navegadores y sistemas. | Para obras con conectividad irregular, la app ofrece menor riesgo operativo. |
| Fotografías y documentos | Integración más directa y consistente con cámara, galería, archivos y almacenamiento del dispositivo. | Puede usar cámara y archivos, con diferencias según el navegador. | La app es más adecuada si se capturan muchas evidencias en campo. |
| Planos y archivos pesados | Mejor control de descargas, caché, almacenamiento, visor y anotaciones. | Factible, pero puede tener más restricciones de memoria, almacenamiento o procesamiento en segundo plano. | El módulo de Planos favorece una aplicación móvil. |
| Notificaciones | Integración estable con las funciones de notificación del sistema. | Disponibles en plataformas compatibles; en iPhone requieren que la PWA esté agregada a la pantalla de inicio. | La app reduce la fricción para avisos de tareas, RFIs y menciones. |
| Rendimiento y experiencia | Interacción más fluida y uniforme para uso intensivo. | Buena para consulta y captura moderada, aunque depende más del navegador y del dispositivo. | El uso diario intensivo en campo favorece la app. |
| Actualizaciones | Requieren generar y distribuir nuevas versiones; algunos cambios pasan por revisión de tienda. | Se publican en el servidor y están disponibles de inmediato. | La PWA permite corregir y mejorar con mayor rapidez. |
| Dependencia de terceros | Depende de las políticas y revisiones de Apple y Google. | Depende de las capacidades y cambios de los navegadores, sin revisión obligatoria para cada actualización web. | Cada opción tiene una dependencia externa diferente. |
| Compatibilidad | Se diseña específicamente para iOS y Android. | Funciona en móviles y computadoras mediante navegador con una sola solución. | La PWA tiene mayor alcance si también se busca uso frecuente desde computadoras. |
| Mantenimiento | Requiere mantener la aplicación y la plataforma web, aunque se compartan servicios y parte del código. | Puede aprovechar mejor el equipo y la solución web existente. | La PWA normalmente reduce el esfuerzo de mantenimiento. |
| Publicación comercial | Presencia formal en App Store y Play Store. | Distribución directa mediante enlace; también existen alternativas de empaquetado para algunas tiendas. | La app ofrece mayor presencia y percepción de producto móvil formal. |
| Mejor escenario de uso | Operación intensiva en campo, conectividad irregular, fotografías, archivos pesados y sincronización confiable. | Consultas, autorizaciones y captura ligera con conectividad frecuente y necesidad de despliegue rápido. | El alcance actual de OGC se acerca más al primer escenario. |

## 9. Ventajas y desventajas resumidas

### Aplicación móvil

**Ventajas**

- Mayor confiabilidad para trabajar sin conexión.
- Mejor manejo de fotografías, documentos y planos pesados.
- Experiencia más uniforme en teléfonos y tabletas.
- Notificaciones e integración con el dispositivo más consistentes.
- Mejor opción para una herramienta de uso diario en campo.

**Desventajas**

- Mayor inversión y tiempo inicial.
- Requiere pruebas en diferentes dispositivos.
- Depende de las revisiones y políticas de las tiendas.
- Implica mantener tanto la plataforma web como la aplicación móvil.

### PWA

**Ventajas**

- Menor barrera de acceso: basta con compartir un enlace.
- Actualizaciones inmediatas sin esperar la aprobación de una tienda.
- Posible reducción de tiempo y costo si se reutiliza la plataforma web.
- Una sola solución puede atender teléfonos, tabletas y computadoras.

**Desventajas**

- El funcionamiento puede variar entre navegadores y sistemas operativos.
- La experiencia sin conexión y la sincronización compleja requieren desarrollo especializado de todas formas.
- Puede ser menos confiable para cargas grandes, procesos en segundo plano y manejo intensivo de archivos.
- En iPhone, algunas funciones —como las notificaciones web— requieren que el usuario agregue la aplicación a la pantalla de inicio.

## 10. Recomendación

Para el alcance descrito, se recomienda **mantener la aplicación móvil como solución principal para el personal de campo** y conservar la plataforma web para las actividades administrativas y financieras de mayor complejidad.

La recomendación se basa en cuatro necesidades críticas del proyecto:

1. Operación frecuente sin conexión.
2. Captura intensiva de fotografías y documentos.
3. Consulta y anotación de planos pesados.
4. Sincronización confiable sin pérdida ni duplicación de datos.

Una PWA sería una alternativa conveniente si la organización decide priorizar una salida más rápida y una inversión inicial menor, y acepta limitar la primera versión a consultas, autorizaciones y capturas ligeras con conexión frecuente.

También puede considerarse un enfoque complementario: **aplicación móvil para campo y plataforma web/PWA para usuarios administrativos**. Esta combinación evita llevar procesos financieros complejos al teléfono antes de que exista una necesidad real y concentra la inversión móvil donde genera mayor valor operativo.

## 11. Decisión solicitada

Para iniciar el proyecto se recomienda autorizar:

- El alcance de la primera versión enfocada en campo.
- El calendario base de 31 semanas hasta el envío a tiendas.
- Una reserva adicional de 4 a 6 semanas o la incorporación de apoyo en desarrollo y calidad.
- La permanencia temporal de las funciones administrativas avanzadas en la plataforma web.
- Una revisión formal al concluir la beta de campo, en la semana 21, antes de continuar con los módulos finales y las etapas posteriores.

> **Nota de consistencia:** el reporte técnico original menciona 51 semanas en su resumen, pero el calendario detallado suma 53 semanas: 31 para la primera etapa, 10 para la segunda y 12 para la tercera. Esta propuesta utiliza 53 semanas porque es la cifra respaldada por el desglose de actividades.

## 12. Referencias para la comparación con PWA

- [Progressive Web Apps, web.dev](https://web.dev/learn/pwa/progressive-web-apps): alcance, instalación, operación sin conexión, distribución y diferencias generales frente a aplicaciones de plataforma.
- [Web Push en aplicaciones web y navegadores, Apple Developer](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers): condiciones de las notificaciones web en dispositivos Apple.
