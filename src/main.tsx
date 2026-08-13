import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/spotlight/styles.css';
import './global.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { isStoryPresenterRequested } from './lib/storyPresenter';

const container = document.getElementById('react-root');
if (container) {
  const root = createRoot(container);
  // both branches load late so the presenter window never pulls in the viewer
  const view = isStoryPresenterRequested()
    ? import('./components/StoryPresenterView').then((m) => <m.StoryPresenterView />)
    : import('./App').then(async (m) => {
        // App's imports register the built-in plugins, so an installed plugin
        // can never claim an id the build already owns
        const { loadInstalledPlugins } = await import('./plugins/runtime/manager');
        loadInstalledPlugins();
        return <m.App />;
      });
  view.then((element) => root.render(<StrictMode>{element}</StrictMode>));
}
