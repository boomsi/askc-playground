import { useMemo } from 'react';
import { Text } from 'keel/guest';

export function usePanels() {
  const left = useMemo(() => <Text>LEFT</Text>, []);
  const right = useMemo(() => <Text>RIGHT</Text>, []);

  return { left, right };
}
