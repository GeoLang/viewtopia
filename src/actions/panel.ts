import { ALL_TOOL_MENU_ITEMS, TOOLBAR_PANEL_ITEMS } from '../components/toolMenus';
import { getPlugin } from '../plugins/registry';
import { useAppStore, type ToolPanel } from '../store/app';
import { ActionError, registerAction } from './registry';

const PANEL_ITEMS = [...TOOLBAR_PANEL_ITEMS, ...ALL_TOOL_MENU_ITEMS];
const PANEL_IDS = PANEL_ITEMS.map((item) => item.panel);
const PANEL_GUIDE = PANEL_ITEMS.map((item) => `${item.panel} is ${item.label}`).join(', ');

function panelLabel(panel: string): string {
  return PANEL_ITEMS.find((item) => item.panel === panel)?.label ?? getPlugin(panel)?.name ?? panel;
}

registerAction({
  name: 'panel.open',
  description:
    'Open one of the panels beside the map, the same ones the toolbar buttons and menus open. Use it when the user names a panel or a tool that lives in one.',
  parameters: {
    panel: {
      type: 'string',
      description: `Which panel, by id. ${PANEL_GUIDE}. A plugin id from the plugins list opens that plugin's panel.`,
      enum: PANEL_IDS,
      required: true,
    },
  },
  run: (args) => {
    const panel = args.panel as string;
    if (!PANEL_IDS.includes(panel as NonNullable<ToolPanel>) && !getPlugin(panel)) {
      throw new ActionError(`No panel is called ${panel}. The ids are: ${PANEL_IDS.join(', ')}.`);
    }
    const store = useAppStore.getState();
    if (store.activePanel === panel) {
      throw new ActionError(`The ${panelLabel(panel)} panel is already open.`);
    }
    store.setActivePanel(panel as ToolPanel);
    return { text: `Opened the ${panelLabel(panel)} panel.` };
  },
});

registerAction({
  name: 'panel.close',
  description: 'Close the panel that is open beside the map.',
  parameters: {},
  run: () => {
    const store = useAppStore.getState();
    if (!store.activePanel) throw new ActionError('No panel is open.');
    const label = panelLabel(store.activePanel);
    store.setActivePanel(null);
    return { text: `Closed the ${label} panel.` };
  },
});
