# Mapa de notas

Fase 1: notas en Markdown con `[[enlaces]]`, offline y sincronización con Supabase.

## Arrancar

```
npm install
npm run dev
```

Sin configurar Supabase funciona solo en local (IndexedDB).

## Web app instalable

`npm run build` genera `dist/` con manifest y service worker (funciona sin conexión). Para instalarla en el móvil tiene que servirse por https; en Chrome para Android: menú > Instalar aplicación. Los iconos salen de `public/favicon.svg` con `node scripts/make-icons.mjs`.

## Activar la sincronización

1. Crear un proyecto gratis en supabase.com.
2. En SQL Editor, ejecutar `supabase/schema.sql` y después `supabase/schema_fase3.sql` (eventos y nodos).
3. En Authentication > Providers > Email, desactivar "Confirm email" para entrar sin verificar el correo.
4. Copiar `.env.example` a `.env` y rellenar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (Project Settings > API).
5. Reiniciar `npm run dev`, pulsar "Cuenta" y crear la cuenta.
