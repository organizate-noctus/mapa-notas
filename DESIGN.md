---
version: 1
name: mapa-notas
description: App personal de notas, mapa 3D y agenda. Cielo nocturno de tinta índigo con luz dorada; sirve a una sola persona que apunta rápido y consulta de noche.
colors:
  fondo: "#0e1020"
  lateral: "#12152b"
  superficie: "#181b34"
  superficie-2: "#20244a"
  linea: "#272b52"
  texto: "#eceaf4"
  texto-suave: "#a4a7c6"
  texto-tenue: "#7f83aa"
  oro: "#f2b84b"
  sobre-oro: "#1c1506"
  estrella: "#b9c4ff"
  enlace: "#aab4ff"
typography:
  display:
    fontFamily: "Bricolage Grotesque Variable, system-ui, sans-serif"
    fontWeight: 600
    letterSpacing: -0.02em
  ui:
    fontFamily: "Instrument Sans Variable, system-ui, sans-serif"
    fontWeight: 400
rounded:
  s: 8px
  m: 12px
  l: 16px
  pildora: 999px
---

## Visión

App para una persona: apunta notas por texto o voz, las enlaza y las ve como constelación; la agenda sale de lo que escribe. Modo operar con el mapa como pieza de mostrar. Diales: variación 5, movimiento 4, densidad 4.

## Ambiente

Nocturno, sereno, con una luz cálida. Tres adjetivos: **íntimo** (una sola persona, nada corporativo), **claro** (se ve de un vistazo qué hay y qué toca), **vivo** (el mapa respira, el resto no se mueve sin motivo).

Gesto audaz: el mapa 3D como cielo. Las notas son estrellas azul pálido, los nodos son oro, los enlaces son hilos tenues. El resto de la interfaz se mantiene callada para que ese cielo mande.

## Color

- Fondo en capas de tinta índigo (nunca negro puro): fondo, lateral, superficie.
- **Oro** = lo que tú decides: acción principal, hoy, día seleccionado, nodos. Fuera de eso no se usa.
- **Estrella** (azul pálido) = una nota. Solo en el mapa y en pequeños detalles.
- Enlaces de texto en `enlace` (azul pálido en oscuro, índigo profundo en claro) porque el oro no tiene contraste como texto sobre claro.
- Tema claro derivado: papel azulado `#f3f2f8`, tinta `#1a1b33`; el oro sigue siendo relleno con texto oscuro. El mapa es siempre cielo nocturno, en ambos temas.

## Tipografía

Bricolage Grotesque (títulos de nota, mes del calendario, cabeceras) e Instrument Sans (todo lo demás). Ambas variables, SIL OFL, servidas desde el propio paquete: la app funciona sin red. Texto de escritura 17 px con interlineado 1,7 y columna de 70 caracteres. Cifras con `tabular-nums` en horas.

## Composición

Escritorio: raíl de iconos (72) · lista de notas (320) · contenido. Móvil: una sola columna con barra inferior de pestañas (Notas, Mapa, Agenda, Cuenta); al abrir una nota la barra desaparece para dejar sitio a escribir.

La nota ocupa una columna centrada. Los eventos detectados y los enlaces entrantes viven debajo, en la misma columna.

## Formas y profundidad

Radios 8 / 12 / 16 y píldora para chips. Sin sombras negras: la profundidad sale de superficies más claras y bordes de 1 px. Solo el desplegable de nodos y los avisos llevan sombra.

## Movimiento

Respuesta inmediata en hover y pulsación (120 ms). Desplegables con entrada corta (140 ms). El mapa gira despacio hasta que lo tocas. Con `prefers-reduced-motion` todo queda estático y el mapa no gira.

## Qué sí / Qué no

- Sí: iconos de línea propios, textos cortos, estados vacíos con una frase útil.
- No: emojis como iconos, degradados morados genéricos, tarjetas idénticas con icono, etiquetas en mayúsculas espaciadas, brillos neón.

## Decisiones descartadas

- Acento índigo/violeta para acciones: demasiado genérico y compite con el cielo.
- Tema claro con mapa claro: pierde el gesto; el mapa se queda nocturno.
- Mono para escribir: la app es de apuntar y repasar, no de código.
