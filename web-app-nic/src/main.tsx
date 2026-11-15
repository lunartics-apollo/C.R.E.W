import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/silkscreen/400.css';
import '@fontsource/chakra-petch/400.css';
import '@fontsource/chakra-petch/600.css';
import '@fontsource/chakra-petch/700.css';
import '@fontsource/jetbrains-mono/400.css';
import './styles/app.css';
import { App } from './ui/App';
import { loadSave } from './state/persistence';
import { useStore } from './state/store';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  // Fonts must be ready before Phaser renders pixel text; then hydrate the local save.
  void Promise.all([document.fonts?.load('8px Silkscreen').catch(() => undefined), loadSave()]).then(([, save]) => {
    useStore.getState().hydrate(save);
  });
}
