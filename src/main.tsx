import { render } from 'preact';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/app.css';
import { App } from './App';
import { startEffects } from './effects';
import { registerServiceWorker } from './pwa';
import { boot, meta, requestPersistence } from './state';

render(<App />, document.getElementById('app')!);

void boot().then(() => {
  startEffects();
  // Ask for persistent storage once the user is past first run.
  if (meta.value.firstRunDone) void requestPersistence();
});
void registerServiceWorker();
