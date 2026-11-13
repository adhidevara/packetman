"use client";

import { variablesToMap, type VariableScopes } from "@packetman/core";
import { useMemo } from "react";
import { useWorkspace } from "@/store/workspace";

/** Variable scopes visible to a request in a given collection (for highlighting and previews). */
export function useScopes(collectionId: string | null | undefined): VariableScopes {
  const env = useWorkspace((s) => s.environments.find((e) => e.id === s.activeEnvId));
  const collection = useWorkspace((s) => (collectionId ? s.collections.find((c) => c.id === collectionId) : undefined));
  const globals = useWorkspace((s) => s.globals);
  return useMemo(
    () => ({
      local: {},
      data: {},
      environment: variablesToMap(env?.values),
      collection: variablesToMap(collection?.variables),
      global: variablesToMap(globals.values),
    }),
    [env, collection, globals],
  );
}
