export function bs(text: string): string {
  return Array.from(text)
    .map((ch) => {
      const code = ch.codePointAt(0)!;
      if (code >= 65 && code <= 90) return String.fromCodePoint(code - 65 + 0x1d5d4);
      if (code >= 97 && code <= 122) return String.fromCodePoint(code - 97 + 0x1d5ee);
      if (code >= 48 && code <= 57) return String.fromCodePoint(code - 48 + 0x1d7ec);
      return ch;
    })
    .join("");
}
