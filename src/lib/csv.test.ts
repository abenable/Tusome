import { describe, it, expect } from "bun:test";

import { toCsv } from "@/lib/csv";

// Helper: strip the BOM for assertions that care about content after it.
function afterBom(s: string): string {
  return s.startsWith("\uFEFF") ? s.slice(1) : s;
}

describe("toCsv — BOM + line endings", () => {
  it("prefixes the output with the UTF-8 BOM (\\uFEFF)", () => {
    const out = toCsv([["a", "b"]]);
    expect(out.startsWith("\uFEFF")).toBe(true);
  });

  it("uses CRLF (\\r\\n) line endings between rows", () => {
    const out = toCsv([["a"], ["b"], ["c"]]);
    // After the BOM, rows are separated by CRLF and the file ends with CRLF.
    const body = afterBom(out);
    expect(body).toBe('"a"\r\n"b"\r\n"c"\r\n');
  });

  it("ends with a trailing CRLF after the last row", () => {
    const out = toCsv([["a"]]);
    expect(out.endsWith("\r\n")).toBe(true);
  });
});

describe("toCsv — headers", () => {
  it("emits the headers as the first row when provided", () => {
    const out = toCsv([["1", "2"]], ["x", "y"]);
    expect(afterBom(out)).toBe('"x","y"\r\n"1","2"\r\n');
  });

  it("emits just headers + CRLF when there are no data rows", () => {
    const out = toCsv([], ["name", "score"]);
    expect(afterBom(out)).toBe('"name","score"\r\n');
  });

  it("emits only the BOM + trailing CRLF for no headers and no rows", () => {
    const out = toCsv([]);
    expect(out).toBe("\uFEFF\r\n");
  });
});

describe("toCsv — quoting + escaping", () => {
  it("comma-separates fields and quotes every field", () => {
    const out = toCsv([["a", "b", "c"]]);
    expect(afterBom(out)).toBe('"a","b","c"\r\n');
  });

  it("preserves an embedded comma inside a quoted field", () => {
    // A field containing a comma must not split the row — quoting protects it.
    const out = toCsv([["a,b", "c"]]);
    expect(afterBom(out)).toBe('"a,b","c"\r\n');
  });

  it("escapes an embedded double-quote by doubling it", () => {
    const out = toCsv([['a"b', "c"]]);
    expect(afterBom(out)).toBe('"a""b","c"\r\n');
  });

  it("preserves an embedded newline inside a quoted field", () => {
    // The field "line1\nline2" stays a single quoted field (Excel reads the
    // embedded LF as an in-field newline, not a row break).
    const out = toCsv([["line1\nline2", "c"]]);
    expect(afterBom(out)).toBe('"line1\nline2","c"\r\n');
  });

  it("preserves an embedded CRLF inside a quoted field", () => {
    const out = toCsv([["line1\r\nline2", "c"]]);
    expect(afterBom(out)).toBe('"line1\r\nline2","c"\r\n');
  });

  it("quotes an empty string field as \"\" (not the text 'null')", () => {
    const out = toCsv([["", "x"]]);
    expect(afterBom(out)).toBe('"","x"\r\n');
  });

  it("stringifies numbers and booleans", () => {
    const out = toCsv([[1, true, 2.5] as unknown as string[]]);
    expect(afterBom(out)).toBe('"1","true","2.5"\r\n');
  });
});

describe("toCsv — realistic class-results matrix", () => {
  // A small class table: one header row (a corner cell + two student names)
  // and two topic rows. Empty cells are a literal "—" so the teacher can tell
  // "no attempts" from a zero score.
  it("round-trips a header + two rows with a hyphen for empty cells", () => {
    const headers = ["Topic", "Akello (S2)", "Brian (S2)"];
    const rows: string[][] = [
      ["Projectile motion", "80%", "—"],
      ["Electric circuits", "—", "60%"],
    ];
    const out = toCsv(rows, headers);
    expect(afterBom(out)).toBe(
      '"Topic","Akello (S2)","Brian (S2)"\r\n' +
        '"Projectile motion","80%","—"\r\n' +
        '"Electric circuits","—","60%"\r\n',
    );
  });

  it("handles a student name containing a comma and a quote", () => {
    // "Mukasa, J." O'Brian — comma forces quoting; the apostrophe is fine
    // unescaped but the field is quoted anyway.
    const headers = ["Topic", 'Mukasa, J. "Jay"'];
    const rows: string[][] = [["Projectile motion", "100%"]];
    const out = toCsv(rows, headers);
    expect(afterBom(out)).toBe(
      '"Topic","Mukasa, J. ""Jay"""\r\n"Projectile motion","100%"\r\n',
    );
  });
});
