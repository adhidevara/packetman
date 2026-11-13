"use client";

import type { RawLanguage, RequestBody } from "@packetman/core";
import { CodeEditor } from "./CodeEditor";
import { KeyValueEditor } from "./KeyValueEditor";
import { Button, cx, Select } from "./ui";

const MODES: { id: RequestBody["mode"]; label: string }[] = [
  { id: "none", label: "Tanpa body" },
  { id: "raw", label: "Raw" },
  { id: "urlencoded", label: "x-www-form-urlencoded" },
  { id: "formdata", label: "form-data" },
];

function switchMode(body: RequestBody, mode: RequestBody["mode"]): RequestBody {
  if (body.mode === mode) return body;
  switch (mode) {
    case "none":
      return { mode };
    case "raw":
      return { mode, language: "json", raw: "" };
    case "urlencoded":
      return { mode, fields: body.mode === "formdata" ? body.fields.map(({ kind: _kind, ...f }) => f) : [] };
    case "formdata":
      return { mode, fields: body.mode === "urlencoded" ? body.fields.map((f) => ({ ...f, kind: "text" as const })) : [] };
  }
}

export function BodyEditor({ body, onChange }: { body: RequestBody; onChange: (b: RequestBody) => void }) {
  const beautify = () => {
    if (body.mode !== "raw" || body.language !== "json") return;
    try {
      onChange({ ...body, raw: JSON.stringify(JSON.parse(body.raw), null, 2) });
    } catch {
      /* invalid JSON (or contains unquoted {{vars}}): leave as typed */
    }
  };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
        <div role="radiogroup" aria-label="Tipe body" className="flex items-center gap-3">
          {MODES.map((m) => (
            <label key={m.id} className={cx("flex cursor-pointer items-center gap-1.5 text-sm", body.mode === m.id ? "text-text" : "text-muted")}>
              <input type="radio" name="body-mode" checked={body.mode === m.id} onChange={() => onChange(switchMode(body, m.id))} className="accent-[var(--brass)]" />
              {m.label}
            </label>
          ))}
        </div>
        {body.mode === "raw" && (
          <div className="ml-auto flex items-center gap-2">
            <Select aria-label="Bahasa raw" className="h-7" value={body.language} onChange={(e) => onChange({ ...body, language: e.target.value as RawLanguage })}>
              <option value="json">JSON</option>
              <option value="text">Text</option>
              <option value="xml">XML</option>
              <option value="html">HTML</option>
              <option value="javascript">JavaScript</option>
            </Select>
            {body.language === "json" && (
              <Button variant="ghost" className="h-7" onClick={beautify}>
                Rapikan
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {body.mode === "none" && <p className="px-4 py-2 text-sm text-muted">Request ini tidak mengirim body.</p>}
        {body.mode === "raw" && (
          <div className="h-full border-t border-line">
            <CodeEditor
              value={body.raw}
              onChange={(raw) => onChange({ ...body, raw })}
              language={body.language === "javascript" ? "javascript" : body.language === "text" ? "text" : body.language === "json" ? "json" : "xml"}
              placeholder={body.language === "json" ? '{\n  "name": "{{$randomFullName}}"\n}' : ""}
              ariaLabel="Body request"
            />
          </div>
        )}
        {body.mode === "urlencoded" && (
          <div className="px-4 pb-4">
            <KeyValueEditor rows={body.fields} onChange={(fields) => onChange({ ...body, fields })} />
          </div>
        )}
        {body.mode === "formdata" && (
          <div className="px-4 pb-4">
            <KeyValueEditor rows={body.fields} onChange={(fields) => onChange({ ...body, fields: fields.map((f) => ({ ...f, kind: "text" as const })) })} />
            <p className="mt-2 text-xs text-faint">Upload file di form-data menyusul di rilis berikutnya.</p>
          </div>
        )}
      </div>
    </div>
  );
}
