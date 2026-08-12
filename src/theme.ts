import {
  createTheme,
  Input,
  type MantineColorsTuple,
} from '@mantine/core';

const violet: MantineColorsTuple = [
  '#f3f0ff',
  '#e5dbff',
  '#d0bfff',
  '#b197fc',
  '#a78bfa',
  '#845ef7',
  '#7950f2',
  '#7c3aed',
  '#6741d9',
  '#5f3dc4',
];

// phone layout cutoff, matches AppShell's `breakpoint: 'sm'`
export const MOBILE_QUERY = '(max-width: 48em)';

// five labeled menus overflow the toolbar row at laptop widths
export const TOOLBAR_ICONS_ONLY_QUERY = '(max-width: 90em)';

export const theme = createTheme({
  primaryColor: 'violet',
  colors: {
    violet,
    dark: [
      '#c9d1d9',
      '#b0b8c1',
      '#8b949e',
      '#6e7681',
      '#484f58',
      '#30363d',
      '#21262d',
      '#161b22',
      '#0d1117',
      '#010409',
    ],
  },
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
  headings: {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
  },
  components: {
    // applies to every Input-based component (TextInput, Select, NumberInput, …)
    Input: Input.extend({
      styles: {
        input: {
          background: 'var(--mantine-color-dark-8)',
          borderColor: 'var(--mantine-color-dark-5)',
        },
      },
    }),
  },
});
