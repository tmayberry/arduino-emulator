/**
 * JSCPP uses real newlines between diagnostic sections, but represents the
 * source excerpt inside a parsing error with escaped newline characters. Turn
 * those source escapes back into lines without altering escape sequences in
 * the parser's "Expected ..." description.
 */
export function normalizeDiagnosticMessage(message: string): string {
  const normalized = message.replace(/\r\n?/g, "\n");
  const expectedSectionIndex = normalized.indexOf("\nExpected ");

  if (expectedSectionIndex === -1) {
    return replaceEscapedSourceNewlines(normalized);
  }

  const sourceSection = normalized.slice(0, expectedSectionIndex);
  const expectedSection = normalized.slice(expectedSectionIndex);

  return `${replaceEscapedSourceNewlines(sourceSection)}${expectedSection}`;
}

function replaceEscapedSourceNewlines(message: string): string {
  return message.replace(/\\r\\n|\\n|\\r/g, "\n");
}
