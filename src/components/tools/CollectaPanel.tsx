import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Image,
  ScrollArea,
  Select,
  Stack,
  Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconClipboardList,
  IconCloudUpload,
  IconPaperclip,
  IconRefresh,
} from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../PanelCard';
import { useAgentLayerStore } from '../../store/agentLayers';
import { getAuthToken } from '../../features/auth/store';
import {
  CollectaError,
  attachmentObjectUrl,
  listForms,
  loadSubmissions,
  publishForm,
  type CollectaForm,
  type PublishResult,
  type SubmissionInfo,
} from '../../lib/collecta';
import {
  branchFeatureCollection,
  branchLayerId,
  fetchBranchFeatures,
} from '../../lib/branchFeatures';
import { addGeoJsonLayer } from '../../lib/mapLayers';

const SUBMISSIONS_LAYER = 'collecta-submissions';
const LAYER_COLOR = '#0ca678';
const PUBLISHED_LAYER_STYLE = { color: '#4c6ef5', lineWidth: 2, filled: true, stroked: true };
const PUBLISH_FAILED = 'Publish failed';

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function when(submission: SubmissionInfo): string {
  if (!submission.completedAt) return 'in progress';
  const parsed = new Date(submission.completedAt);
  return Number.isNaN(parsed.getTime()) ? submission.completedAt : parsed.toLocaleString();
}

export function CollectaPanel({ onClose }: { onClose: () => void }) {
  const [forms, setForms] = useState<CollectaForm[]>([]);
  const [formId, setFormId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionInfo[] | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState<PublishResult | null>(null);
  // attachment id -> object URL of fetched bytes, shown inline when an image
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const previewsRef = useRef(previews);
  previewsRef.current = previews;

  const refresh = useCallback(async () => {
    // without a token every route can only answer 401, so we never send one
    if (!getAuthToken()) {
      setNeedsSignIn(true);
      setForms([]);
      return;
    }
    setNeedsSignIn(false);
    setLoading(true);
    setError(null);
    try {
      setForms(await listForms());
    } catch (e) {
      if (e instanceof CollectaError && e.status === 401) setNeedsSignIn(true);
      else setError(message(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // the object URLs hold the fetched bytes alive, so closing lets them go
  useEffect(
    () => () => {
      const store = useAgentLayerStore.getState();
      store.removeLayer(SUBMISSIONS_LAYER);
      for (const url of Object.values(previewsRef.current)) URL.revokeObjectURL(url);
    },
    [],
  );

  const pickForm = async (id: string | null) => {
    setFormId(id);
    setSubmissions(null);
    setPublished(null);
    setError(null);
    if (!id) {
      useAgentLayerStore.getState().removeLayer(SUBMISSIONS_LAYER);
      return;
    }
    setLoading(true);
    try {
      const layer = await loadSubmissions(id);
      setSubmissions(layer.submissions);
      const form = forms.find((f) => f.id === id);
      useAgentLayerStore.getState().addLayer({
        id: SUBMISSIONS_LAYER,
        name: form ? `Submissions: ${form.title}` : 'Submissions',
        color: LAYER_COLOR,
        geojson: layer.geojson,
      });
    } catch (e) {
      setError(message(e));
      useAgentLayerStore.getState().removeLayer(SUBMISSIONS_LAYER);
    } finally {
      setLoading(false);
    }
  };

  const publish = async () => {
    if (!formId) return;
    setPublishing(true);
    try {
      const result = await publishForm(formId);
      setPublished(result);
      const features = await fetchBranchFeatures(result.branchId);
      addGeoJsonLayer(
        branchLayerId(result.branchId),
        branchFeatureCollection(features),
        PUBLISHED_LAYER_STYLE,
      );
      notifications.show({
        title: 'Published to Ptolemy',
        message: `Published ${plural(result.published, 'submission')}, ${result.skipped} skipped`,
        color: 'teal',
      });
    } catch (e) {
      notifications.show({ title: PUBLISH_FAILED, message: message(e), color: 'red' });
    } finally {
      setPublishing(false);
    }
  };

  const showAttachment = async (id: string) => {
    if (previews[id]) return;
    try {
      const url = await attachmentObjectUrl(id);
      setPreviews((current) => ({ ...current, [id]: url }));
    } catch (e) {
      setError(message(e));
    }
  };

  const located = submissions?.filter((s) => s.located).length ?? 0;
  const withFiles = submissions?.filter((s) => s.attachments.length > 0) ?? [];

  return (
    <PanelCard width={320} maxHeight="70vh">
      <PanelHeader
        icon={<IconClipboardList size={16} />}
        title="Field Data"
        onClose={onClose}
        actions={
          <ActionIcon
            size="sm"
            variant="subtle"
            color="gray"
            aria-label="Refresh forms"
            loading={loading}
            onClick={() => void refresh()}
          >
            <IconRefresh size={14} />
          </ActionIcon>
        }
      />

      {needsSignIn ? (
        <Text size="xs" c="dimmed" py="lg" ta="center" data-testid="collecta-signin">
          Sign in to browse field data forms.
        </Text>
      ) : (
        <ScrollArea flex={1}>
          <Stack gap="xs">
            <Select
              size="xs"
              label="Form"
              placeholder={forms.length ? 'Pick a form' : 'No forms visible to this account'}
              data={forms.map((f) => ({
                value: f.id,
                label: `${f.title} (v${f.version})`,
              }))}
              value={formId}
              onChange={(id) => void pickForm(id)}
              data-testid="collecta-form"
            />

            {error && (
              <Text size="xs" c="red" data-testid="collecta-error">
                {error}
              </Text>
            )}

            {submissions && (
              <Group gap="xs" data-testid="collecta-counts">
                <Badge size="xs" variant="light" color="teal">
                  {plural(submissions.length, 'submission')}
                </Badge>
                {located < submissions.length && (
                  <Badge size="xs" variant="light" color="gray">
                    {submissions.length - located} without location
                  </Badge>
                )}
                {published && (
                  <Badge size="xs" variant="light" color="indigo" data-testid="collecta-published">
                    {published.totalPublished} in dataset
                  </Badge>
                )}
              </Group>
            )}

            {formId && (
              <Button
                size="xs"
                variant="light"
                leftSection={<IconCloudUpload size={14} />}
                loading={publishing}
                disabled={publishing}
                onClick={() => void publish()}
                data-testid="collecta-publish"
              >
                {published ? 'Publish again' : 'Publish'}
              </Button>
            )}

            {submissions && submissions.length === 0 && (
              <Text size="xs" c="dimmed" ta="center">
                No submissions for this form yet.
              </Text>
            )}

            {withFiles.map((submission) => (
              <Stack key={submission.id} gap={4}>
                <Group gap={4}>
                  <IconPaperclip size={12} />
                  <Text size="xs" c="dimmed">
                    {when(submission)}
                    {submission.collectorId ? ` — ${submission.collectorId}` : ''}
                  </Text>
                </Group>
                {submission.attachments.map((attachment) =>
                  previews[attachment.id] ? (
                    attachment.mimeType.startsWith('image/') ? (
                      <Image
                        key={attachment.id}
                        src={previews[attachment.id]}
                        alt={attachment.filename}
                        radius="sm"
                      />
                    ) : (
                      <Button
                        key={attachment.id}
                        size="xs"
                        variant="light"
                        component="a"
                        href={previews[attachment.id]}
                        download={attachment.filename}
                      >
                        Save {attachment.filename}
                      </Button>
                    )
                  ) : (
                    <Button
                      key={attachment.id}
                      size="xs"
                      variant="subtle"
                      onClick={() => void showAttachment(attachment.id)}
                    >
                      {attachment.filename}
                    </Button>
                  ),
                )}
              </Stack>
            ))}
          </Stack>
        </ScrollArea>
      )}
    </PanelCard>
  );
}
