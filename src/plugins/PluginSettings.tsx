/**
 * PluginSettings — auto-generates settings UI from a plugin's settings schema.
 *
 * Used in the Settings panel to show per-plugin configuration.
 */

import { useState, useEffect } from 'react';
import {
  Text,
  Stack,
  TextInput,
  NumberInput,
  Switch,
  Select,
  ColorInput,
  Group,
  Badge,
  Accordion,
} from '@mantine/core';
import { getPlugins } from './registry';
import type { PluginSettingField } from './sdk';

export function PluginSettingsPanel() {
  const plugins = getPlugins().filter((p) => p.settings && p.settings.length > 0);

  if (plugins.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No plugins with configurable settings installed.
      </Text>
    );
  }

  return (
    <Accordion variant="separated">
      {plugins.map((plugin) => (
        <Accordion.Item key={plugin.id} value={plugin.id}>
          <Accordion.Control>
            <Group gap="xs">
              {plugin.icon}
              <Text size="sm" fw={500}>{plugin.name}</Text>
              <Badge size="xs" variant="light">{plugin.version}</Badge>
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
            <PluginSettingsFields pluginId={plugin.id} fields={plugin.settings!} />
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion>
  );
}

function PluginSettingsFields({ pluginId, fields }: { pluginId: string; fields: PluginSettingField[] }) {
  const storageKey = `viewtopia-plugin-settings:${pluginId}`;
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || '{}');
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(values));
  }, [values, storageKey]);

  const setValue = (key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Stack gap="xs">
      {fields.map((field) => {
        const val = values[field.key] ?? field.defaultValue;
        switch (field.type) {
          case 'text':
            return (
              <TextInput
                key={field.key}
                label={field.label}
                description={field.description}
                value={(val as string) || ''}
                onChange={(e) => setValue(field.key, e.target.value)}
                size="xs"
              />
            );
          case 'number':
            return (
              <NumberInput
                key={field.key}
                label={field.label}
                description={field.description}
                value={(val as number) ?? 0}
                onChange={(v) => setValue(field.key, v)}
                min={field.min}
                max={field.max}
                size="xs"
              />
            );
          case 'boolean':
            return (
              <Switch
                key={field.key}
                label={field.label}
                description={field.description}
                checked={!!val}
                onChange={(e) => setValue(field.key, e.currentTarget.checked)}
                size="xs"
              />
            );
          case 'select':
            return (
              <Select
                key={field.key}
                label={field.label}
                description={field.description}
                data={field.options || []}
                value={(val as string) || ''}
                onChange={(v) => setValue(field.key, v)}
                size="xs"
              />
            );
          case 'color':
            return (
              <ColorInput
                key={field.key}
                label={field.label}
                description={field.description}
                value={(val as string) || '#000000'}
                onChange={(v) => setValue(field.key, v)}
                size="xs"
              />
            );
          default:
            return null;
        }
      })}
    </Stack>
  );
}
