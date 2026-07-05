import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles.css'
import './components/ui/spark-tokens.css'
import { initDatabase } from './db/database.js'
import { useSettingsStore } from './stores/useSettingsStore.js'

/**
 * Bootstrap: open IndexedDB, load persisted settings, then mount React.
 */
async function bootstrap() {
  try {
    await initDatabase();
    console.log('[main] Database initialised');

    // Load persisted settings before first render
    await useSettingsStore.getState().loadSettings();
    console.log('[main] Settings loaded');
  } catch (err) {
    console.error('[main] Bootstrap error (app will still render):', err);
  }

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

bootstrap();
