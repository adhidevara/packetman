"use client";

import { scanCollection, scanEnvironment } from "@packetman/core";
import { ShieldCheck, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { GLOBALS_ID, useWorkspace } from "@/store/workspace";
import { AuthEditor } from "./AuthEditor";
import { ScriptsEditor } from "./ScriptsEditor";
import { EmptyState, SubTabs } from "./ui";
import { VariablesTable } from "./VariablesTable";

function SecretBanner({ count }: { count: number }) {
  if (!count)
    return (
      <p className="flex items-center gap-1.5 text-xs text-ok">
        <ShieldCheck size={13} /> Tidak ada kredensial terdeteksi di nilai yang bisa diekspor.
      </p>
    );
  return (
    <p className="flex items-center gap-1.5 text-xs text-warn">
      <TriangleAlert size={13} /> {count} nilai terlihat seperti kredensial. Ubah tipenya ke secret agar tidak ikut ekspor.
    </p>
  );
}

export function EnvironmentTab({ envId }: { envId: string }) {
  const env = useWorkspace((s) => (envId === GLOBALS_ID ? s.globals : s.environments.find((e) => e.id === envId)));
  const activeEnvId = useWorkspace((s) => s.activeEnvId);
  const { updateEnvironment, setActiveEnv } = useWorkspace.getState();
  if (!env) return <EmptyState title="Environment tidak ditemukan" />;
  const isGlobals = env.id === GLOBALS_ID;
  return (
    <div className="h-full overflow-auto p-5">
      <div className="mb-4 flex items-center gap-3">
        {isGlobals ? (
          <h1 className="text-lg font-semibold">Globals</h1>
        ) : (
          <input
            aria-label="Nama environment"
            value={env.name}
            onChange={(e) => updateEnvironment({ ...env, name: e.target.value })}
            className="rounded-[5px] bg-transparent px-1 text-lg font-semibold outline-none hover:bg-hover focus:bg-hover"
          />
        )}
        {!isGlobals &&
          (activeEnvId === env.id ? (
            <span className="rounded-[4px] border border-brass/50 px-1.5 py-0.5 text-2xs text-brass">aktif</span>
          ) : (
            <button type="button" className="text-xs text-info hover:underline" onClick={() => setActiveEnv(env.id)}>
              Jadikan aktif
            </button>
          ))}
      </div>
      <p className="mb-3 max-w-2xl text-sm text-muted">
        {isGlobals ? "Variabel global berlaku di semua koleksi dan environment." : "Pakai variabel di URL, header, body, atau auth dengan menulis {{nama}}."}
      </p>
      <VariablesTable vars={env.values} onChange={(values) => updateEnvironment({ ...env, values })} />
      <div className="mt-3">
        <SecretBanner count={scanEnvironment(env).length} />
      </div>
    </div>
  );
}

type CollectionSub = "variables" | "auth" | "scripts";

export function CollectionTab({ collectionId }: { collectionId: string }) {
  const collection = useWorkspace((s) => s.collections.find((c) => c.id === collectionId));
  const { updateCollection } = useWorkspace.getState();
  const [sub, setSub] = useState<CollectionSub>("variables");
  if (!collection) return <EmptyState title="Koleksi tidak ditemukan" />;
  const findings = scanCollection(collection);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-5 pt-4 pb-2">
        <input
          aria-label="Nama koleksi"
          value={collection.name}
          onChange={(e) => updateCollection(collection.id, (c) => ({ ...c, name: e.target.value }))}
          className="rounded-[5px] bg-transparent px-1 text-lg font-semibold outline-none hover:bg-hover focus:bg-hover"
        />
        <textarea
          aria-label="Deskripsi koleksi"
          value={collection.description ?? ""}
          placeholder="Deskripsi koleksi (opsional)"
          onChange={(e) => updateCollection(collection.id, (c) => ({ ...c, description: e.target.value }))}
          rows={2}
          className="mt-1 block w-full max-w-2xl resize-none rounded-[5px] bg-transparent px-1 text-sm text-muted outline-none hover:bg-hover focus:bg-hover"
        />
      </div>
      <SubTabs<CollectionSub>
        value={sub}
        onChange={setSub}
        tabs={[
          { id: "variables", label: "Variabel", count: collection.variables.length },
          { id: "auth", label: "Auth", marker: collection.auth.type !== "none" ? "dot" : undefined },
          { id: "scripts", label: "Scripts", marker: collection.scripts.preRequest.trim() || collection.scripts.postResponse.trim() ? "dot" : undefined },
        ]}
      />
      <div className="min-h-0 flex-1 overflow-auto">
        {sub === "variables" && (
          <div className="p-5">
            <VariablesTable vars={collection.variables} onChange={(variables) => updateCollection(collection.id, (c) => ({ ...c, variables }))} />
            <div className="mt-3 flex flex-col gap-1">
              <SecretBanner count={findings.length} />
              {findings.length > 0 && (
                <ul className="ml-5 list-disc text-xs text-muted">
                  {findings.slice(0, 8).map((f, i) => (
                    <li key={i}>
                      {f.location} · {f.field}: {f.pattern} ({f.preview})
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
        {sub === "auth" && (
          <AuthEditor auth={collection.auth} allowInherit={false} collectionId={collection.id} onChange={(auth) => updateCollection(collection.id, (c) => ({ ...c, auth }))} />
        )}
        {sub === "scripts" && <ScriptsEditor scripts={collection.scripts} onChange={(scripts) => updateCollection(collection.id, (c) => ({ ...c, scripts }))} />}
      </div>
    </div>
  );
}
