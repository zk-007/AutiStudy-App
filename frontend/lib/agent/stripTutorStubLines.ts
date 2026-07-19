/** Remove "Read this part first / tell me more" stubs — not for voice-first answers. */
export function stripTutorStubLines(text: string): string {
  return text
    .replace(/\s*📖\s*Read this part first![\s\S]*$/i, "")
    .replace(/\s*📖\s*Read this first[\s\S]*$/i, "")
    .replace(/\s*Read this (?:part )?first[\s\S]*$/i, "")
    .replace(/\s*📖\s*پہلے یہ حصہ پڑھیں[\s\S]*$/i, "")
    .replace(/\s*Say \*\*tell me more\*\*[^\n]*/gi, "")
    .replace(/\s*Say tell me more[^\n]*/gi, "")
    .replace(/\s*\*\*tell me more\*\*[^\n]*/gi, "")
    .replace(/\s*\*\*مزید بتائیں\*\*[^\n]*/gi, "")
    .replace(/\s*then if you have confusion[^\n]*/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
