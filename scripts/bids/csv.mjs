// A small streaming CSV reader. SAM.gov's daily file is about 220 MB with long multi-line descriptions, so it is read piece by piece
// and never held in memory whole. Handles quoted fields, doubled quotes ("") and line breaks inside quotes.

/** Yields one row (an array of strings) at a time from an async iterable of bytes or strings. */
export async function* csvRows(source) {
  const decoder = new TextDecoder("utf-8");
  let field = "";
  let row = [];
  let inQuotes = false;
  let quotePending = false; // inside quotes, the last character was a quote: it either ends the field or is half of a doubled quote

  for await (const chunk of source) {
    const text = typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
    let i = 0;
    while (i < text.length) {
      if (inQuotes) {
        if (quotePending) {
          quotePending = false;
          if (text[i] === '"') {
            field += '"';
            i++;
            continue;
          }
          inQuotes = false; // that quote closed the field; handle this character as normal text below
        } else {
          const q = text.indexOf('"', i);
          if (q === -1) {
            field += text.slice(i);
            i = text.length;
          } else {
            field += text.slice(i, q);
            quotePending = true;
            i = q + 1;
          }
          continue;
        }
      }
      const c = text[i];
      if (c === '"' && field === "") {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n") {
        row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
        yield row;
        row = [];
        field = "";
      } else {
        field += c;
      }
      i++;
    }
  }
  if (quotePending) inQuotes = false;
  if (field !== "" || row.length) {
    row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
    yield row;
  }
}
