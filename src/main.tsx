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
    : import('./App').then((m) => <m.App />);
  view.then((element) => root.render(<StrictMode>{element}</StrictMode>));
}
