/** Reads the text out of a solicitation file in the browser, so the file itself never has to be stored. PDFs and plain text are supported. */
export const MAX_TEXT = 120_000;
const MAX_BYTES = 15 * 1024 * 1024;

export async function extractText(file: File): Promise<{ text: string; truncated: boolean }> {
  if (file.size > MAX_BYTES) throw new Error("That file is over 15 MB. Paste the key sections instead.");
  const name = file.name.toLowerCase();
  let text = "";
  if (file.type === "application/pdf" || name.endsWith(".pdf")) {
    // Loaded only when a PDF is chosen: the PDF reader is large and the rest of the site does not need it.
    const pdfjs = await import("pdfjs-dist");
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const parts: string[] = [];
    for (let i = 1; i <= doc.numPages && parts.join("\n").length < MAX_TEXT; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      parts.push(content.items.map((it) => ("str" in it ? it.str : "")).join(" "));
    }
    text = parts.join("\n\n");
  } else if (/\.(txt|md|csv|html?)$/.test(name) || file.type.startsWith("text/")) {
    text = await file.text();
    if (/\.html?$/.test(name)) text = text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
  } else {
    throw new Error("Upload a PDF or a text file. For a Word document, copy its text and paste it in.");
  }
  text = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length < 20) throw new Error("No readable text was found. A scanned PDF has no text to read: paste the key sections instead.");
  return { text: text.slice(0, MAX_TEXT), truncated: text.length > MAX_TEXT };
}
