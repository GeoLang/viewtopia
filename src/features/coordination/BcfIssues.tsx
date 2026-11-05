import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Autocomplete,
  Badge,
  Button,
  Checkbox,
  Divider,
  FileButton,
  Group,
  Image,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Textarea,
  UnstyledButton,
} from '@mantine/core';
import type { Cesium3DTileset, Viewer } from 'cesium';
import { getActiveCesiumViewer } from '../../viewer/registry';
import { useAuthStore } from '../auth/store';
import { TiletopiaElementService } from '../elements/elementService';
import {
  deleteBcfTopic,
  exportBcf,
  importBcf,
  listBcfTopics,
  readBcfTopic,
  readViewpointSnapshot,
  saveBcfTopic,
  saveDownloadedFile,
  type BcfComment,
  type BcfImportReport,
  type BcfTopic,
  type BcfTopicSummary,
  type BcfViewpoint,
} from './api';
import { captureViewpoint, restoreViewpoint, type RestoredViewpoint } from './viewpoint';
import { randomUuid } from '../../lib/randomUuid';

const BCF_FILES = '.bcf,.bcfzip';

interface TopicDraft {
  title: string;
  topicType: string;
  topicStatus: string;
  description: string;
  captureView: boolean;
}

function failureText(failure: unknown): string {
  return failure instanceof Error ? failure.message : String(failure);
}

function importReportText(report: BcfImportReport): string {
  const sentences = [
    `Imported ${report.topics} topics, ${report.created} new and ${report.updated} replaced, with ${report.comments} comments and ${report.viewpoints} viewpoints.`,
  ];
  const { unknownIds } = report.elementReferences;
  if (unknownIds > 0) sentences.push(`${unknownIds} element ids are not in this version of the model.`);
  const dropped = Object.entries(report.dropped).filter(([, count]) => count > 0);
  if (dropped.length > 0) {
    const parts = dropped.map(([part, count]) => `${count} ${part}`).join(', ');
    sentences.push(`Not stored, so an export lacks them: ${parts}.`);
  }
  return sentences.join(' ');
}

function restoredText(restored: RestoredViewpoint): string {
  const sentences = [
    restored.isolated === null
      ? `Viewpoint restored: ${restored.selected} selected and ${restored.hidden} hidden.`
      : `Viewpoint restored: ${restored.selected} selected and only ${restored.isolated} shown.`,
  ];
  if (restored.notInModel.length > 0) {
    sentences.push(`${restored.notInModel.length} element ids are not in this version of the model.`);
  }
  if (restored.withoutMesh.length > 0) {
    sentences.push(`${restored.withoutMesh.length} elements have no mesh to show.`);
  }
  if (restored.notApplied.length > 0) sentences.push(`Not applied: ${restored.notApplied.join(', ')}.`);
  return sentences.join(' ');
}

function signedInAuthor(): string {
  const { user } = useAuthStore.getState();
  const author = user?.email || user?.name;
  if (!author) throw new Error('Your account has no email or name to sign this change with.');
  return author;
}

function newTopic(author: string, now: string): BcfTopic {
  return {
    guid: randomUuid(),
    serverAssignedId: null,
    topicType: '',
    topicStatus: '',
    referenceLinks: [],
    title: '',
    priority: null,
    index: null,
    labels: [],
    creationDate: now,
    creationAuthor: author,
    modifiedDate: null,
    modifiedAuthor: null,
    dueDate: null,
    assignedTo: null,
    stage: null,
    description: null,
    externalBimSnippet: null,
    externalDocuments: [],
    relatedTopics: [],
    files: [],
    comments: [],
    viewpoints: [],
  };
}

function distinctValues(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function TopicForm({
  editing,
  typeChoices,
  statusChoices,
  canCapture,
  busy,
  onSave,
  onCancel,
}: {
  editing: BcfTopic | null;
  typeChoices: string[];
  statusChoices: string[];
  canCapture: boolean;
  busy: boolean;
  onSave: (draft: TopicDraft) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(editing?.title ?? '');
  const [topicType, setTopicType] = useState(editing?.topicType ?? '');
  const [topicStatus, setTopicStatus] = useState(editing?.topicStatus ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [captureView, setCaptureView] = useState(false);
  const complete = [title, topicType, topicStatus].every((value) => value.trim() !== '');

  return (
    <Stack gap={4} data-testid="bcf-topic-form">
      <Divider label={editing ? `Edit ${editing.title}` : 'New topic'} labelPosition="left" />
      <TextInput size="xs" label="Title" value={title} onChange={(event) => setTitle(event.currentTarget.value)} />
      <Group gap={4} wrap="nowrap" grow>
        <Autocomplete size="xs" label="Type" data={typeChoices} value={topicType} onChange={setTopicType} />
        <Autocomplete size="xs" label="Status" data={statusChoices} value={topicStatus} onChange={setTopicStatus} />
      </Group>
      <Textarea
        size="xs"
        label="Description"
        autosize
        minRows={2}
        value={description}
        onChange={(event) => setDescription(event.currentTarget.value)}
      />
      <Checkbox
        size="xs"
        label="Add the current view as a viewpoint"
        disabled={!canCapture}
        checked={captureView}
        onChange={(event) => setCaptureView(event.currentTarget.checked)}
      />
      <Group gap={4}>
        <Button
          size="compact-xs"
          color="violet"
          disabled={!complete || busy}
          onClick={() => onSave({ title, topicType, topicStatus, description, captureView })}
        >
          Save topic
        </Button>
        <Button size="compact-xs" variant="subtle" color="gray" onClick={onCancel}>
          Cancel
        </Button>
      </Group>
    </Stack>
  );
}

function ViewpointSnapshot({
  assetId,
  topicGuid,
  viewpointGuid,
  position,
}: {
  assetId: string;
  topicGuid: string;
  viewpointGuid: string;
  position: number;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    // tiletopia reads the token from the Authorization header only, which an img src cannot send
    readViewpointSnapshot(assetId, topicGuid, viewpointGuid)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setFailure(failureText(reason));
      });
    return () => {
      cancelled = true;
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId, topicGuid, viewpointGuid]);

  if (failure) {
    return (
      <Text size="xs" c="red" data-testid={`bcf-snapshot-error-${viewpointGuid}`}>
        Snapshot {position} could not be read: {failure}
      </Text>
    );
  }
  if (url === null) return null;
  return <Image src={url} alt={`Snapshot of viewpoint ${position}`} radius="sm" />;
}

function TopicDetail({
  assetId,
  topic,
  canRestore,
  busy,
  commentDraft,
  onCommentDraft,
  onRestore,
  onEdit,
  onDelete,
  onAddComment,
}: {
  assetId: string;
  topic: BcfTopic;
  canRestore: boolean;
  busy: boolean;
  commentDraft: string;
  onCommentDraft: (text: string) => void;
  onRestore: (viewpoint: BcfViewpoint) => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddComment: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const withCamera = topic.viewpoints.filter((viewpoint) => viewpoint.camera !== null);
  const viewpointOf = (guid: string | null) => withCamera.find((viewpoint) => viewpoint.guid === guid);
  const withSnapshot = topic.viewpoints.filter((viewpoint) => viewpoint.snapshotFormat !== null);
  return (
    <Stack gap={4} data-testid="bcf-topic-detail">
      <Text size="xs" c="white" fw={600}>
        {topic.title}
      </Text>
      <Text size="xs" c="dimmed">
        {[topic.topicType, topic.topicStatus, topic.priority, topic.assignedTo && `assigned to ${topic.assignedTo}`]
          .filter(Boolean)
          .join(', ')}
      </Text>
      {topic.description && <Text size="xs">{topic.description}</Text>}
      {confirmingDelete ? (
        <Group gap={4}>
          <Text size="xs" c="yellow">
            Delete this topic with its comments and snapshots?
          </Text>
          <Button size="compact-xs" color="red" disabled={busy} onClick={onDelete}>
            Delete topic
          </Button>
          <Button size="compact-xs" variant="subtle" color="gray" onClick={() => setConfirmingDelete(false)}>
            Keep
          </Button>
        </Group>
      ) : (
        <Group gap={4}>
          <Button size="compact-xs" variant="light" color="violet" onClick={onEdit}>
            Edit
          </Button>
          <Button size="compact-xs" variant="subtle" color="red" onClick={() => setConfirmingDelete(true)}>
            Delete
          </Button>
        </Group>
      )}
      {withCamera.length > 1 && (
        <Group gap={4}>
          {withCamera.map((viewpoint, position) => (
            <Button
              key={viewpoint.guid}
              size="compact-xs"
              variant="light"
              color="violet"
              disabled={!canRestore}
              onClick={() => onRestore(viewpoint)}
            >
              Viewpoint {position + 1}
            </Button>
          ))}
        </Group>
      )}
      {topic.viewpoints.length > 0 && withCamera.length === 0 && (
        <Text size="xs" c="dimmed" data-testid="bcf-snapshot-only">
          Its viewpoints hold only snapshots, so there is no camera to restore.
        </Text>
      )}
      {withSnapshot.map((viewpoint, position) => (
        <ViewpointSnapshot
          key={viewpoint.guid}
          assetId={assetId}
          topicGuid={topic.guid}
          viewpointGuid={viewpoint.guid}
          position={position + 1}
        />
      ))}
      <Divider label={`${topic.comments.length} comments`} labelPosition="left" />
      {topic.comments.map((comment) => {
        const linked = viewpointOf(comment.viewpointGuid);
        return (
          <Stack gap={0} key={comment.guid} data-testid={`bcf-comment-${comment.guid}`}>
            <Text size="xs" c="violet.4">
              {comment.author}, {comment.date}
            </Text>
            <Text size="xs" style={{ overflowWrap: 'anywhere' }}>
              {comment.comment ?? ''}
            </Text>
            {linked && (
              <Button
                size="compact-xs"
                variant="subtle"
                color="violet"
                disabled={!canRestore}
                onClick={() => onRestore(linked)}
                style={{ alignSelf: 'flex-start' }}
              >
                Show its viewpoint
              </Button>
            )}
          </Stack>
        );
      })}
      <Textarea
        size="xs"
        label="New comment"
        autosize
        minRows={2}
        value={commentDraft}
        onChange={(event) => onCommentDraft(event.currentTarget.value)}
      />
      <Button
        size="compact-xs"
        variant="light"
        color="violet"
        disabled={commentDraft.trim() === '' || busy}
        onClick={onAddComment}
        style={{ alignSelf: 'flex-start' }}
      >
        Add comment
      </Button>
    </Stack>
  );
}

export function BcfIssues({
  assetId,
  modelName,
  tileset,
}: {
  assetId: string;
  modelName: string;
  tileset: Cesium3DTileset | undefined;
}) {
  const service = useMemo(() => new TiletopiaElementService(assetId), [assetId]);
  const [topics, setTopics] = useState<BcfTopicSummary[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [nextPage, setNextPage] = useState<string | undefined>(undefined);
  const [listReads, setListReads] = useState(0);
  const [topic, setTopic] = useState<BcfTopic | null>(null);
  const [form, setForm] = useState<{ editing: BcfTopic | null } | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [restored, setRestored] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resetFileInput = useRef<() => void>(null);
  const latestChoice = useRef(0);

  useEffect(() => {
    let cancelled = false;
    listBcfTopics(assetId)
      .then((page) => {
        if (cancelled) return;
        setTopics(page.items);
        setTotal(page.total);
        setNextPage(page.continuationToken);
      })
      .catch((failure: unknown) => {
        if (!cancelled) setError(failureText(failure));
      });
    return () => {
      cancelled = true;
    };
  }, [assetId, listReads]);

  const readMoreTopics = () => {
    listBcfTopics(assetId, nextPage)
      .then((page) => {
        setTopics((known) => [...known, ...page.items]);
        setNextPage(page.continuationToken);
      })
      .catch((failure: unknown) => setError(failureText(failure)));
  };

  const scene = (): { viewer: Viewer; tileset: Cesium3DTileset } => {
    const viewer = getActiveCesiumViewer();
    if (!viewer || !tileset) throw new Error(`There is no Cesium globe showing ${modelName}.`);
    return { viewer, tileset };
  };

  const restore = async (viewpoint: BcfViewpoint, choice: number) => {
    const result = await restoreViewpoint({ ...scene(), service, viewpoint });
    if (choice === latestChoice.current) setRestored(restoredText(result));
  };

  const run = async (label: string, work: (choice: number) => Promise<void>) => {
    latestChoice.current += 1;
    const choice = latestChoice.current;
    setError(null);
    setBusy(label);
    try {
      await work(choice);
    } catch (failure) {
      if (choice === latestChoice.current) setError(failureText(failure));
    } finally {
      if (choice === latestChoice.current) setBusy(null);
    }
  };

  const chooseTopic = (summary: BcfTopicSummary) =>
    run(`Reading ${summary.title}.`, async (choice) => {
      setRestored(null);
      setForm(null);
      setCommentDraft('');
      const read = await readBcfTopic(assetId, summary.guid);
      if (choice !== latestChoice.current) return;
      setTopic(read);
      const first = read.viewpoints.find((viewpoint) => viewpoint.camera !== null);
      if (first && tileset) await restore(first, choice);
    });

  const chooseViewpoint = (viewpoint: BcfViewpoint) =>
    run('Restoring the viewpoint.', (choice) => restore(viewpoint, choice));

  const saveTopic = (draft: TopicDraft, editing: BcfTopic | null) =>
    run('Saving the topic.', async (choice) => {
      const author = signedInAuthor();
      const now = new Date().toISOString();
      const viewpoint = draft.captureView ? captureViewpoint(scene()) : null;
      // tiletopia's topic put replaces the whole topic, comments included
      const base = editing ? await readBcfTopic(assetId, editing.guid) : newTopic(author, now);
      const saved = await saveBcfTopic(assetId, {
        ...base,
        title: draft.title.trim(),
        topicType: draft.topicType.trim(),
        topicStatus: draft.topicStatus.trim(),
        description: draft.description.trim() || null,
        modifiedDate: editing ? now : base.modifiedDate,
        modifiedAuthor: editing ? author : base.modifiedAuthor,
        viewpoints: viewpoint ? [...base.viewpoints, viewpoint] : base.viewpoints,
      });
      setListReads((reads) => reads + 1);
      if (choice !== latestChoice.current) return;
      setTopic(saved);
      setForm(null);
      setNotice(`Saved ${saved.title}.`);
    });

  const addComment = (commented: BcfTopic) =>
    run('Adding the comment.', async (choice) => {
      const author = signedInAuthor();
      const fresh = await readBcfTopic(assetId, commented.guid);
      const comment: BcfComment = {
        guid: randomUuid(),
        date: new Date().toISOString(),
        author,
        comment: commentDraft.trim(),
        viewpointGuid: null,
        modifiedDate: null,
        modifiedAuthor: null,
      };
      const saved = await saveBcfTopic(assetId, { ...fresh, comments: [...fresh.comments, comment] });
      setListReads((reads) => reads + 1);
      if (choice !== latestChoice.current) return;
      setTopic(saved);
      setCommentDraft('');
    });

  const removeTopic = (removed: BcfTopic) =>
    run(`Deleting ${removed.title}.`, async () => {
      await deleteBcfTopic(assetId, removed.guid);
      setListReads((reads) => reads + 1);
      setTopic((shown) => (shown?.guid === removed.guid ? null : shown));
      setRestored(null);
      setNotice(`Deleted ${removed.title}.`);
    });

  const importFile = (file: File | null) => {
    // browsers fire no change event when the file already in the input is picked again
    resetFileInput.current?.();
    if (!file) return;
    void run(`Importing ${file.name}.`, async () => {
      setNotice(importReportText(await importBcf(assetId, file)));
      setListReads((reads) => reads + 1);
    });
  };

  const exportFile = () =>
    run('Exporting the topics.', async () => {
      saveDownloadedFile(await exportBcf(assetId));
    });

  const canRestore = tileset !== undefined;

  return (
    <Stack gap="xs" data-testid="bcf-issues">
      <Group gap={4}>
        <Button size="compact-xs" variant="light" color="violet" onClick={() => setForm({ editing: null })}>
          New topic
        </Button>
        <FileButton onChange={importFile} accept={BCF_FILES} resetRef={resetFileInput}>
          {(props) => (
            <Button {...props} size="compact-xs" variant="light" color="violet">
              Import BCF
            </Button>
          )}
        </FileButton>
        <Button size="compact-xs" variant="light" color="violet" onClick={() => void exportFile()}>
          Export BCF
        </Button>
      </Group>
      {!canRestore && (
        <Text size="xs" c="dimmed" data-testid="bcf-restore-note">
          Viewpoints restore on the Cesium globe once {modelName} has loaded there.
        </Text>
      )}
      {busy && (
        <Text size="xs" c="dimmed" data-testid="bcf-busy">
          {busy}
        </Text>
      )}
      {notice && (
        <Text size="xs" c="dimmed" data-testid="bcf-notice">
          {notice}
        </Text>
      )}
      {error && (
        <Text size="xs" c="red" data-testid="bcf-error">
          {error}
        </Text>
      )}
      {restored && (
        <Text size="xs" c="dimmed" data-testid="bcf-restored">
          {restored}
        </Text>
      )}
      {form && (
        <TopicForm
          key={form.editing?.guid ?? 'new'}
          editing={form.editing}
          typeChoices={distinctValues(topics.map((summary) => summary.topicType))}
          statusChoices={distinctValues(topics.map((summary) => summary.topicStatus))}
          canCapture={canRestore}
          busy={busy !== null}
          onSave={(draft) => void saveTopic(draft, form.editing)}
          onCancel={() => setForm(null)}
        />
      )}
      <ScrollArea.Autosize mah={220}>
        <Stack gap={2} data-testid="bcf-topics">
          {total !== null && (
            <Text size="xs" c="dimmed">
              {total} topics
            </Text>
          )}
          {topics.map((summary) => (
            <UnstyledButton
              key={summary.guid}
              data-testid={`bcf-topic-${summary.guid}`}
              onClick={() => void chooseTopic(summary)}
              style={{
                padding: '2px 4px',
                borderRadius: 4,
                background: topic?.guid === summary.guid ? 'var(--mantine-color-violet-9)' : undefined,
              }}
            >
              <Group gap={4} wrap="nowrap" justify="space-between">
                <Text size="xs" lineClamp={1}>
                  {summary.serverAssignedId ? `${summary.serverAssignedId} ` : ''}
                  {summary.title}
                </Text>
                <Badge size="xs" variant="light" color="gray">
                  {summary.topicStatus}
                </Badge>
              </Group>
              <Text size="xs" c="dimmed">
                {summary.commentCount} comments, {summary.viewpointCount} viewpoints
              </Text>
            </UnstyledButton>
          ))}
          {nextPage !== undefined && (
            <Button size="compact-xs" variant="subtle" color="gray" onClick={readMoreTopics}>
              More topics
            </Button>
          )}
        </Stack>
      </ScrollArea.Autosize>
      {topic && (
        <ScrollArea.Autosize mah={360}>
          <TopicDetail
            key={topic.guid}
            assetId={assetId}
            topic={topic}
            canRestore={canRestore}
            busy={busy !== null}
            commentDraft={commentDraft}
            onCommentDraft={setCommentDraft}
            onRestore={(viewpoint) => void chooseViewpoint(viewpoint)}
            onEdit={() => setForm({ editing: topic })}
            onDelete={() => void removeTopic(topic)}
            onAddComment={() => void addComment(topic)}
          />
        </ScrollArea.Autosize>
      )}
    </Stack>
  );
}