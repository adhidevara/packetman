import { describe, expect, it } from "vitest";
import { parseCsv, parseDataFile, parseJsonData } from "../src";

describe("data files", () => {
  it("parses CSV with quotes, embedded commas/newlines, CRLF and BOM", () => {
    const csv = '﻿email,name,note\r\nbudi@x.id,"Budi, S.","line1\nline2"\r\nsiti@x.id,Siti,"she said ""hi"""\r\n';
    const out = parseCsv(csv);
    expect(out.columns).toEqual(["email", "name", "note"]);
    expect(out.rows).toEqual([
      { email: "budi@x.id", name: "Budi, S.", note: "line1\nline2" },
      { email: "siti@x.id", name: "Siti", note: 'she said "hi"' },
    ]);
  });

  it("fills missing trailing columns with empty strings", () => {
    expect(parseCsv("a,b\n1").rows).toEqual([{ a: "1", b: "" }]);
  });

  it("rejects unterminated quotes", () => {
    expect(() => parseCsv('a\n"oops')).toThrow(/kutip/);
  });

  it("parses JSON arrays and stringifies nested values", () => {
    const out = parseJsonData('[{"id":1,"tags":["a"]},{"id":2,"extra":true}]');
    expect(out.columns).toEqual(["id", "tags", "extra"]);
    expect(out.rows[0]).toEqual({ id: "1", tags: '["a"]' });
    expect(() => parseJsonData('{"id":1}')).toThrow(/array/);
  });

  it("detects format from filename or content", () => {
    expect(parseDataFile("[{\"a\":1}]").format).toBe("json");
    expect(parseDataFile("a\n1", "users.csv").format).toBe("csv");
  });
});
