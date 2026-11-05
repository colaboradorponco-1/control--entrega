import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

async function limpiarCacheObsoleto() {
  try {
    const clave = 'mapa-entregas-retirado-20261104';
    if (localStorage.getItem('app-cache-version') === clave) return;
    if ('serviceWorker' in navigator) {
      const registros = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registros.map((registro) => registro.unregister()));
    }
    if ('caches' in window) {
      const nombres = await caches.keys();
      await Promise.all(nombres.map((nombre) => caches.delete(nombre)));
    }
    localStorage.setItem('app-cache-version', clave);
    window.location.reload();
  } catch (error) {
    console.error('No se pudo limpiar la caché obsoleta:', error);
  }
}

void limpiarCacheObsoleto();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
