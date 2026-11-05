import { useMemo, useRef, useState } from 'react';
import { TiletopiaElementService, resolveElementIds } from '../elements/elementService';
import { flyToElements } from '../elements/flyToElements';
import { useElementStore } from '../elements/store';

export function failureText(failure: unknown): string {
  return failure instanceof Error ? failure.message : String(failure);
}

export function useShowElementInScene(assetId: string) {
  const service = useMemo(() => new TiletopiaElementService(assetId), [assetId]);
  const latestShow = useRef(0);
  const [showNote, setShowNote] = useState<string | null>(null);
  const [showError, setShowError] = useState<string | null>(null);

  const showElement = async (id: string, { name, notInModelNote }: { name: string; notInModelNote: string }) => {
    latestShow.current += 1;
    const choice = latestShow.current;
    setShowError(null);
    setShowNote(null);
    try {
      const { located, notFound } = await resolveElementIds(service, [id]);
      if (choice !== latestShow.current) return;
      if (notFound.length > 0) {
        setShowNote(notInModelNote);
        return;
      }
      if (located.length === 0) {
        setShowNote(`${name} has no mesh and nothing with a mesh inside it, so there is nothing to show.`);
        return;
      }
      useElementStore.getState().selectElement(id, {
        additive: false,
        fromScene: false,
        contents: located.map((row) => row.id),
      });
      flyToElements(located);
    } catch (failure) {
      if (choice === latestShow.current) setShowError(failureText(failure));
    }
  };

  return { showElement, showNote, showError };
}
