import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Divider, FileButton, Group, ScrollArea, Stack, Text, UnstyledButton } from '@mantine/core';
import { ElementApiError, TiletopiaElementService, resolveElementIds } from '../elements/elementService';
import { useElementStore } from '../elements/store';
import {
  pollIdsCheck,
  readLatestIdsCheck,
  startIdsCheck,
  type IdsCheck,
  type IdsFailedElement,
  type IdsReport,
  type IdsRequirementResult,
  type IdsSpecificationResult,
} from './api';
import { failureText, useShowElementInScene } from './showElementInScene';

export function failedGlobalIds(report: IdsReport | null | undefined): string[] {
  const failed: string[] = [];
  for (const specification of report?.specifications ?? []) {
    for (const requirement of specification.requirements) {
      for (const element of requirement.failed_entities) {
        if (element.global_id) failed.push(element.global_id);
      }
    }
  }
  return failed;
}

const IDS_FILES = '.ids';
const SERVICE_UNAVAILABLE = 503;
const FAILED_ELEMENTS_PER_PAGE = 50;

function statusBadge(status: boolean | null) {
  if (status === null) {
    return (
      <Badge size="xs" variant="light" color="gray">
        skipped
      </Badge>
    );
  }
  return (
    <Badge size="xs" variant="light" color={status ? 'green' : 'red'}>
      {status ? 'pass' : 'fail'}
    </Badge>
  );
}

function failedElementName(element: IdsFailedElement): string {
  return element.name ?? element.global_id ?? `#${element.id}`;
}

function SpecificationFailureNote({ specification }: { specification: IdsSpecificationResult }) {
  if (specification.status !== false) return null;
  const hasFailedElements = specification.requirements.some((requirement) => requirement.failed_entities.length > 0);
  if (hasFailedElements) return null;
  // ifctester fails a required specification nothing matches, and a prohibited one anything matches
  const note =
    specification.total_applicable === 0
      ? 'No element matches the applicability of this required specification.'
      : `${specification.total_applicable} elements match this specification, which the IDS prohibits.`;
  return (
    <Text size="xs" c="yellow" data-testid="ids-specification-note">
      {note}
    </Text>
  );
}

function FailedRequirement({
  requirement,
  canShowInScene,
  onShow,
}: {
  requirement: IdsRequirementResult;
  canShowInScene: boolean;
  onShow: (element: IdsFailedElement) => void;
}) {
  const [shownCount, setShownCount] = useState(FAILED_ELEMENTS_PER_PAGE);
  const shown = requirement.failed_entities.slice(0, shownCount);
  const hiddenCount = requirement.failed_entities.length - shown.length;
  return (
    <Stack gap={2}>
      {shown.map((element) => (
        <UnstyledButton
          key={element.id}
          data-testid={`ids-failed-${element.global_id ?? element.id}`}
          disabled={!canShowInScene || element.global_id === null}
          onClick={() => onShow(element)}
          style={{ padding: '2px 4px', borderRadius: 4 }}
        >
          <Text size="xs" lineClamp={1}>
            {failedElementName(element)} ({element.class})
          </Text>
          <Text size="xs" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
            {element.global_id === null ? `${element.reason}. It has no GlobalId to select it by.` : element.reason}
          </Text>
        </UnstyledButton>
      ))}
      {hiddenCount > 0 && (
        <Button
          size="compact-xs"
          variant="subtle"
          color="gray"
          onClick={() => setShownCount((count) => count + FAILED_ELEMENTS_PER_PAGE)}
        >
          {hiddenCount} more failed elements
        </Button>
      )}
    </Stack>
  );
}

function IdsReportView({
  report,
  assetId,
  canShowInScene,
}: {
  report: IdsReport;
  assetId: string;
  canShowInScene: boolean;
}) {
  const { showElement, showNote, showError } = useShowElementInScene(assetId);

  const showFailedElement = (element: IdsFailedElement) => {
    if (element.global_id === null) return;
    const name = failedElementName(element);
    void showElement(element.global_id, {
      name,
      notInModelNote: `${name} is not in the element store of this model.`,
    });
  };

  return (
    <Stack gap={4} data-testid="ids-report">
      <Text size="xs" data-testid="ids-summary">
        {report.title}: {report.total_specifications_pass} of {report.total_specifications} specifications pass,{' '}
        {report.total_checks_pass} of {report.total_checks} checks pass.
      </Text>
      {canShowInScene ? (
        <Text size="xs" c="dimmed">
          Click a failed element to select it in the model and fly to it.
        </Text>
      ) : (
        <Text size="xs" c="dimmed" data-testid="ids-show-note">
          Failed elements show in the scene once the model has loaded on the Cesium globe with element ids.
        </Text>
      )}
      {showError && (
        <Text size="xs" c="red" data-testid="ids-show-error">
          {showError}
        </Text>
      )}
      {showNote && (
        <Text size="xs" c="yellow" data-testid="ids-show-result">
          {showNote}
        </Text>
      )}
      <ScrollArea.Autosize mah={360}>
        <Stack gap="xs">
          {report.specifications.map((specification, specificationIndex) => (
            <Stack key={specificationIndex} gap={2} data-testid={`ids-specification-${specificationIndex}`}>
              <Divider />
              <Group gap={4} wrap="nowrap">
                {statusBadge(specification.status)}
                <Text size="xs" fw={600} lineClamp={2}>
                  {specification.name}
                </Text>
              </Group>
              <Text size="xs" c="dimmed">
                {specification.total_applicable_pass} of {specification.total_applicable} applicable elements pass.
              </Text>
              <SpecificationFailureNote specification={specification} />
              {specification.requirements.map((requirement, requirementIndex) => (
                <Stack
                  key={requirementIndex}
                  gap={2}
                  pl="xs"
                  data-testid={`ids-requirement-${specificationIndex}-${requirementIndex}`}
                >
                  <Group gap={4} wrap="nowrap" align="flex-start">
                    {statusBadge(requirement.status)}
                    <Text size="xs" style={{ overflowWrap: 'anywhere' }}>
                      {requirement.description}
                    </Text>
                  </Group>
                  <Text size="xs" c="dimmed">
                    {requirement.total_pass} pass, {requirement.total_fail} fail.
                  </Text>
                  {requirement.failed_entities.length > 0 && (
                    <FailedRequirement
                      requirement={requirement}
                      canShowInScene={canShowInScene}
                      onShow={showFailedElement}
                    />
                  )}
                </Stack>
              ))}
            </Stack>
          ))}
        </Stack>
      </ScrollArea.Autosize>
    </Stack>
  );
}

export function ModelIdsCheck({ assetId, canShowInScene }: { assetId: string; canShowInScene: boolean }) {
  const [check, setCheck] = useState<IdsCheck | null>(null);
  const [latestRead, setLatestRead] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const resetFileInput = useRef<() => void>(null);
  const polling = useRef<{ running: AbortController | null }>({ running: null });
  const service = useMemo(() => new TiletopiaElementService(assetId), [assetId]);

  const followCheck = useCallback(async () => {
    polling.current.running?.abort();
    const controller = new AbortController();
    polling.current.running = controller;
    try {
      await pollIdsCheck(assetId, { onUpdate: setCheck, signal: controller.signal });
    } catch (failure) {
      if (!controller.signal.aborted) setError(failureText(failure));
    }
  }, [assetId]);

  useEffect(() => {
    const following = polling.current;
    let cancelled = false;
    readLatestIdsCheck(assetId)
      .then((latest) => {
        if (cancelled) return;
        setCheck(latest);
        setLatestRead(true);
        if (latest?.status === 'running') void followCheck();
      })
      .catch((failure: unknown) => {
        if (!cancelled) setError(failureText(failure));
      });
    return () => {
      cancelled = true;
      following.running?.abort();
    };
  }, [assetId, followCheck]);

  const checkFile = async (file: File | null) => {
    // browsers fire no change event when the file already in the input is picked again
    resetFileInput.current?.();
    if (!file) return;
    setError(null);
    setUnavailable(null);
    setNotice(null);
    setUploading(file.name);
    try {
      await startIdsCheck(assetId, file);
    } catch (failure) {
      const refusal = failure instanceof ElementApiError ? failure : null;
      if (refusal?.status === SERVICE_UNAVAILABLE) {
        setUnavailable(refusal.message);
        return;
      }
      if (refusal?.code !== 'IDS_CHECK_RUNNING') {
        setError(failureText(failure));
        return;
      }
      setNotice(`${refusal.message} Showing the check that is running.`);
    } finally {
      setUploading(null);
    }
    await followCheck();
  };

  useEffect(() => {
    let cancelled = false;
    resolveElementIds(service, failedGlobalIds(check?.report))
      .then(({ located }) => {
        if (!cancelled) useElementStore.getState().setFailed(located.map((row) => row.id));
      })
      .catch((failure: unknown) => {
        if (!cancelled) setError(failureText(failure));
      });
    return () => {
      cancelled = true;
      useElementStore.getState().setFailed([]);
    };
  }, [service, check]);

  const running = check?.status === 'running';

  return (
    <Stack gap="xs" data-testid="ids-check">
      <Group gap={4}>
        <FileButton onChange={(file) => void checkFile(file)} accept={IDS_FILES} resetRef={resetFileInput}>
          {(props) => (
            <Button
              {...props}
              size="compact-xs"
              variant="light"
              color="violet"
              loading={uploading !== null}
              disabled={running}
            >
              Check against an IDS file
            </Button>
          )}
        </FileButton>
      </Group>
      {uploading && (
        <Text size="xs" c="dimmed" data-testid="ids-uploading">
          Uploading {uploading}.
        </Text>
      )}
      {notice && (
        <Text size="xs" c="dimmed" data-testid="ids-notice">
          {notice}
        </Text>
      )}
      {error && (
        <Text size="xs" c="red" data-testid="ids-error">
          {error}
        </Text>
      )}
      {unavailable && (
        <Stack gap={2} data-testid="ids-unavailable">
          <Text size="xs" c="yellow">
            {unavailable}
          </Text>
          <Text size="xs" c="dimmed">
            If tiletopia is up, IDS checks need TILETOPIA_IDS_CHECK_URL set on tiletopia to the address of the
            ids-check service, http://ids-check:8000 in the platform compose stack.
          </Text>
        </Stack>
      )}
      {latestRead && check === null && (
        <Text size="xs" c="dimmed" data-testid="ids-never-checked">
          This model has not been checked against an IDS file.
        </Text>
      )}
      {check?.status === 'running' && (
        <Text size="xs" c="dimmed" data-testid="ids-running">
          Checking the model against {check.idsFileName}.
        </Text>
      )}
      {check?.status === 'failed' && (
        <Text size="xs" c="red" data-testid="ids-check-failed">
          The check against {check.idsFileName} failed: {check.error}
        </Text>
      )}
      {check?.status === 'done' && (
        <Text size="xs" c="dimmed" data-testid="ids-checked">
          Checked against {check.idsFileName}
          {check.checkedAt ? ` at ${new Date(check.checkedAt).toLocaleString()}` : ''}.
        </Text>
      )}
      {check?.status === 'done' && check.report && (
        <IdsReportView report={check.report} assetId={assetId} canShowInScene={canShowInScene} />
      )}
    </Stack>
  );
}
