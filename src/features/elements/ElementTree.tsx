import { useCallback, useEffect, useRef, useState } from 'react';
import { ActionIcon, Box, Button, Group, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import type { ElementTreeNode, TiletopiaElementService } from './elementService';

// tiletopia answers up to 50000 children of one node, more rows than a plain list can draw
const CHILDREN_SHOWN_AT_ONCE = 200;
const ROOT_NODE_KEY = 'root';
const INDENT_PIXELS = 12;

export function ElementRowButton({
  id,
  label,
  ifcClass,
  selected,
  hidden,
  revealed,
  onSelect,
}: {
  id: string;
  label: string;
  ifcClass: string;
  selected: boolean;
  hidden: boolean;
  revealed: boolean;
  onSelect: (id: string, additive: boolean) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (revealed) buttonRef.current?.scrollIntoView({ block: 'nearest' });
  }, [revealed]);
  return (
    <UnstyledButton
      ref={buttonRef}
      data-testid={`element-row-${id}`}
      aria-pressed={selected}
      onClick={(event) => onSelect(id, event.ctrlKey || event.metaKey || event.shiftKey)}
      style={{
        flex: 1,
        minWidth: 0,
        borderRadius: 4,
        background: selected ? 'var(--mantine-color-violet-9)' : undefined,
        opacity: hidden ? 0.5 : 1,
      }}
    >
      <Group gap={4} wrap="nowrap">
        <Text size="xs" c="white" truncate td={hidden ? 'line-through' : undefined}>
          {label}
        </Text>
        <Text size="xs" c="dimmed" truncate>
          {ifcClass}
        </Text>
      </Group>
    </UnstyledButton>
  );
}

interface TreeProps {
  service: TiletopiaElementService;
  selected: ReadonlySet<string>;
  hidden: ReadonlySet<string>;
  focusedId: string | null;
  revealId: string | null;
  onSelectNode: (node: ElementTreeNode, additive: boolean) => void;
  onError: (failure: unknown) => void;
}

function shownCount(limits: Record<string, number>, key: string): number {
  return limits[key] ?? CHILDREN_SHOWN_AT_ONCE;
}

export function ElementTree({
  service,
  selected,
  hidden,
  focusedId,
  revealId,
  onSelectNode,
  onError,
}: TreeProps) {
  const loadedChildren = useRef(new Map<string, ElementTreeNode[]>());
  const [, setLoadCount] = useState(0);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [limits, setLimits] = useState<Record<string, number>>({});
  const [revealedId, setRevealedId] = useState<string | null>(null);

  const load = useCallback(
    async (key: string): Promise<ElementTreeNode[]> => {
      const known = loadedChildren.current.get(key);
      if (known) return known;
      const { nodes } = await service.getElementTreeChildren({ nodeKey: key });
      loadedChildren.current.set(key, nodes);
      setLoadCount((count) => count + 1);
      return nodes;
    },
    [service],
  );

  useEffect(() => {
    load(ROOT_NODE_KEY).catch(onError);
  }, [load, onError]);

  useEffect(() => {
    if (revealId === null) return;
    let cancelled = false;
    const reveal = async () => {
      const { path } = await service.getElementTreeParents(revealId);
      let parentKey = ROOT_NODE_KEY;
      for (const [depth, entry] of path.entries()) {
        const siblingsKey = parentKey;
        const siblings = await load(siblingsKey);
        if (cancelled) return;
        const index = siblings.findIndex((node) => node.id === entry.id);
        if (index === -1) {
          throw new Error(`tree/parents named ${entry.id}, which is not a child of its parent.`);
        }
        setLimits((known) => ({
          ...known,
          [siblingsKey]: Math.max(shownCount(known, siblingsKey), index + 1),
        }));
        if (depth === path.length - 1) break;
        const { key } = siblings[index];
        setExpanded((open) => new Set(open).add(key));
        parentKey = key;
      }
      setRevealedId(revealId);
    };
    reveal().catch(onError);
    return () => {
      cancelled = true;
    };
  }, [service, revealId, load, onError]);

  const toggle = (node: ElementTreeNode) => {
    const open = new Set(expanded);
    if (open.has(node.key)) {
      open.delete(node.key);
    } else {
      open.add(node.key);
      load(node.key).catch(onError);
    }
    setExpanded(open);
  };

  const renderChildren = (parentKey: string, depth: number) => {
    const children = loadedChildren.current.get(parentKey);
    if (!children) return null;
    const count = shownCount(limits, parentKey);
    return (
      <>
        {children.slice(0, count).map((node) => (
          <Box key={node.key}>
            <Group gap={2} wrap="nowrap" style={{ paddingLeft: depth * INDENT_PIXELS }}>
              {node.hasChildren ? (
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  color="gray"
                  title={`${expanded.has(node.key) ? 'Collapse' : 'Expand'} ${node.label}`} aria-label={`${expanded.has(node.key) ? 'Collapse' : 'Expand'} ${node.label}`}
                  aria-expanded={expanded.has(node.key)}
                  onClick={() => toggle(node)}
                >
                  {expanded.has(node.key) ? (
                    <IconChevronDown size={12} />
                  ) : (
                    <IconChevronRight size={12} />
                  )}
                </ActionIcon>
              ) : (
                <Box w={22} />
              )}
              <ElementRowButton
                id={node.id}
                label={node.label}
                ifcClass={node.ifcClass}
                selected={selected.has(node.id) || focusedId === node.id}
                hidden={hidden.has(node.id)}
                revealed={revealedId === node.id}
                onSelect={(_id, additive) => onSelectNode(node, additive)}
              />
            </Group>
            {expanded.has(node.key) && renderChildren(node.key, depth + 1)}
          </Box>
        ))}
        {children.length > count && (
          <Button
            size="compact-xs"
            variant="subtle"
            color="gray"
            ml={depth * INDENT_PIXELS}
            onClick={() =>
              setLimits((known) => ({ ...known, [parentKey]: count + CHILDREN_SHOWN_AT_ONCE }))
            }
          >
            Show more ({children.length - count} left)
          </Button>
        )}
      </>
    );
  };

  return (
    <Stack gap={0} data-testid="element-tree">
      {renderChildren(ROOT_NODE_KEY, 0)}
    </Stack>
  );
}
