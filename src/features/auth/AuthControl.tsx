import { useState } from 'react';
import {
  ActionIcon,
  Tooltip,
  Modal,
  Menu,
  Stack,
  TextInput,
  PasswordInput,
  Button,
  Text,
  Anchor,
  Group,
  Divider,
} from '@mantine/core';
import { IconKey, IconUser, IconSettings, IconLogout } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useAuthStore } from './store';

type View = 'login' | 'register' | 'apikey';

export function AuthControl() {
  const loggedIn = useAuthStore((s) => s.loggedIn);
  const user = useAuthStore((s) => s.user);
  const error = useAuthStore((s) => s.error);
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const loginWithApiKey = useAuthStore((s) => s.loginWithApiKey);
  const logout = useAuthStore((s) => s.logout);
  const setError = useAuthStore((s) => s.setError);

  const [opened, setOpened] = useState(false);
  const [view, setView] = useState<View>('login');
  const [busy, setBusy] = useState(false);

  // Form fields (shared across views; cleared on open).
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [confirm, setConfirm] = useState('');
  const [apiKey, setApiKey] = useState('');

  const open = () => {
    setError(null);
    setView('login');
    setEmail('');
    setPassword('');
    setName('');
    setConfirm('');
    setApiKey('');
    setOpened(true);
  };

  const handleLogin = async () => {
    setBusy(true);
    const ok = await login(email, password);
    setBusy(false);
    if (ok) {
      setOpened(false);
      notifications.show({ title: 'Signed in', message: email, color: 'green' });
    }
  };

  const handleRegister = async () => {
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    const ok = await register(name, email, password);
    setBusy(false);
    if (ok) {
      setView('login');
      notifications.show({
        title: 'Account created',
        message: 'You can now log in.',
        color: 'green',
      });
    }
  };

  const handleApiKey = () => {
    loginWithApiKey(apiKey);
    setOpened(false);
    notifications.show({ title: 'Authenticated', message: 'API key set', color: 'green' });
  };

  if (loggedIn) {
    return (
      <Menu shadow="md" width={200} position="bottom-end">
        <Menu.Target>
          <Tooltip label={user?.name || user?.email || 'Account'}>
            <ActionIcon aria-label="Account" variant="subtle" color="violet">
              <IconUser size={16} />
            </ActionIcon>
          </Tooltip>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>
            {user?.name || 'User'}
            {user?.email ? ` · ${user.email}` : ''}
          </Menu.Label>
          <Menu.Item leftSection={<IconSettings size={14} />} disabled>
            Settings (coming soon)
          </Menu.Item>
          <Menu.Item
            color="red"
            leftSection={<IconLogout size={14} />}
            onClick={() => {
              logout();
              notifications.show({ title: 'Signed out', message: '', color: 'gray' });
            }}
          >
            Logout
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    );
  }

  return (
    <>
      <Tooltip label="Login / Account">
        <ActionIcon aria-label="Login" variant="subtle" color="gray" onClick={open}>
          <IconKey size={16} />
        </ActionIcon>
      </Tooltip>

      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title={view === 'login' ? 'Login' : view === 'register' ? 'Create account' : 'Use API Key'}
        centered
        size="sm"
      >
        {view === 'login' && (
          <Stack gap="sm">
            <TextInput
              label="Email or username"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
            />
            <PasswordInput
              label="Password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleLogin();
              }}
            />
            {error && (
              <Text size="xs" c="red">
                {error}
              </Text>
            )}
            <Button color="violet" loading={busy} onClick={handleLogin}>
              Login
            </Button>
            <Group justify="center" gap="xs">
              <Anchor size="xs" onClick={() => { setError(null); setView('register'); }}>
                Create account
              </Anchor>
              <Text size="xs" c="dimmed">
                |
              </Text>
              <Anchor
                size="xs"
                onClick={() =>
                  notifications.show({
                    title: 'Password reset',
                    message: 'Check with your TileTopia admin.',
                    color: 'blue',
                  })
                }
              >
                Forgot password
              </Anchor>
            </Group>
            <Divider label="or" labelPosition="center" />
            <Button variant="default" onClick={() => { setError(null); setView('apikey'); }}>
              Use API Key
            </Button>
          </Stack>
        )}

        {view === 'register' && (
          <Stack gap="sm">
            <TextInput label="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} />
            <TextInput
              label="Email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
            />
            <PasswordInput
              label="Password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
            />
            <PasswordInput
              label="Confirm password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.currentTarget.value)}
            />
            {error && (
              <Text size="xs" c="red">
                {error}
              </Text>
            )}
            <Button color="violet" loading={busy} onClick={handleRegister}>
              Create Account
            </Button>
            <Anchor size="xs" ta="center" onClick={() => { setError(null); setView('login'); }}>
              ← Back to login
            </Anchor>
          </Stack>
        )}

        {view === 'apikey' && (
          <Stack gap="sm">
            <TextInput
              label="API Key"
              placeholder="tt_xxxxx…"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.currentTarget.value)}
            />
            <Button color="violet" disabled={!apiKey.trim()} onClick={handleApiKey}>
              Authenticate
            </Button>
            <Anchor size="xs" ta="center" onClick={() => { setError(null); setView('login'); }}>
              ← Back to login
            </Anchor>
          </Stack>
        )}
      </Modal>
    </>
  );
}
