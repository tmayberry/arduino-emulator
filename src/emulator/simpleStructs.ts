import type { ArduinoIncludeModule, JscppRuntime } from "./arduinoApi";

export const SIMPLE_STRUCT_INCLUDE = "__ArduinoEmulatorStructs.h";

interface Token {
  value: string;
  start: number;
  end: number;
  line: number;
  kind: "identifier" | "number" | "symbol" | "literal";
}

interface SimpleStructField {
  name: string;
  type: string;
  dimensions: number[];
}

interface SimpleStructDefinition {
  name: string;
  fields: SimpleStructField[];
}

export interface PreparedSimpleStructs {
  source: string;
  include?: ArduinoIncludeModule;
}

export class SimpleStructCompatibilityError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(message);
    this.name = "SimpleStructCompatibilityError";
  }
}

const SUPPORTED_FIELD_TYPES = new Set([
  "bool",
  "char",
  "signed char",
  "unsigned char",
  "short",
  "short int",
  "signed short",
  "signed short int",
  "unsigned short",
  "unsigned short int",
  "int",
  "signed int",
  "unsigned",
  "unsigned int",
  "long",
  "long int",
  "signed long",
  "signed long int",
  "unsigned long",
  "unsigned long int",
  "long long",
  "long long int",
  "signed long long",
  "signed long long int",
  "unsigned long long",
  "unsigned long long int",
  "float",
  "double",
  "String",
]);

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  let line = 1;

  while (index < source.length) {
    const current = source[index];
    const next = source[index + 1];

    if (/\s/.test(current)) {
      if (current === "\n") line += 1;
      index += 1;
      continue;
    }

    if (current === "/" && next === "/") {
      index += 2;
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }

    if (current === "/" && next === "*") {
      const commentLine = line;
      index += 2;
      while (
        index < source.length &&
        !(source[index] === "*" && source[index + 1] === "/")
      ) {
        if (source[index] === "\n") line += 1;
        index += 1;
      }
      if (index >= source.length) {
        throw new SimpleStructCompatibilityError(
          "Unterminated block comment.",
          commentLine,
        );
      }
      index += 2;
      continue;
    }

    if (current === '"' || current === "'") {
      const start = index;
      const literalLine = line;
      const quote = current;
      index += 1;
      while (index < source.length) {
        if (source[index] === "\\" && source[index + 1] !== undefined) {
          index += 2;
          continue;
        }
        if (source[index] === quote) {
          index += 1;
          break;
        }
        if (source[index] === "\n") line += 1;
        index += 1;
      }
      tokens.push({
        value: source.slice(start, index),
        start,
        end: index,
        line: literalLine,
        kind: "literal",
      });
      continue;
    }

    if (/[A-Za-z_]/.test(current)) {
      const start = index;
      index += 1;
      while (index < source.length && /[A-Za-z0-9_]/.test(source[index])) {
        index += 1;
      }
      tokens.push({
        value: source.slice(start, index),
        start,
        end: index,
        line,
        kind: "identifier",
      });
      continue;
    }

    if (/[0-9]/.test(current)) {
      const start = index;
      index += 1;
      while (index < source.length && /[0-9]/.test(source[index])) index += 1;
      tokens.push({
        value: source.slice(start, index),
        start,
        end: index,
        line,
        kind: "number",
      });
      continue;
    }

    tokens.push({
      value: current,
      start: index,
      end: index + 1,
      line,
      kind: "symbol",
    });
    index += 1;
  }

  return tokens;
}

function compatibilityError(message: string, token: Token): never {
  throw new SimpleStructCompatibilityError(
    `Unsupported struct declaration: ${message}`,
    token.line,
  );
}

function parseMemberDeclaration(tokens: Token[]): SimpleStructField[] {
  if (tokens.length === 0) return [];

  let typeEnd = 0;
  for (let index = 1; index <= tokens.length; index += 1) {
    if (
      SUPPORTED_FIELD_TYPES.has(
        tokens
          .slice(0, index)
          .map((token) => token.value)
          .join(" "),
      )
    ) {
      typeEnd = index;
    }
  }

  if (typeEnd === 0) {
    compatibilityError(
      "fields must use primitive numeric, character, boolean, or String types.",
      tokens[0],
    );
  }

  const type = tokens
    .slice(0, typeEnd)
    .map((token) => token.value)
    .join(" ");
  const fields: SimpleStructField[] = [];
  let index = typeEnd;

  while (index < tokens.length) {
    const name = tokens[index];
    if (name.kind !== "identifier") {
      compatibilityError(
        "expected a field name; pointers, references, and methods are not supported.",
        name,
      );
    }
    index += 1;

    const dimensions: number[] = [];
    while (tokens[index]?.value === "[") {
      const size = tokens[index + 1];
      const closing = tokens[index + 2];
      if (size?.kind !== "number" || closing?.value !== "]") {
        compatibilityError(
          "array sizes must be positive integer literals.",
          size ?? tokens[index],
        );
      }
      const numericSize = Number(size.value);
      if (!Number.isSafeInteger(numericSize) || numericSize <= 0) {
        compatibilityError(
          "array sizes must be positive integer literals.",
          size,
        );
      }
      dimensions.push(numericSize);
      index += 3;
    }

    fields.push({ name: name.value, type, dimensions });

    if (index === tokens.length) break;
    if (tokens[index].value !== ",") {
      compatibilityError(
        "member initializers, methods, pointers, and references are not supported.",
        tokens[index],
      );
    }
    index += 1;
    if (index === tokens.length) {
      compatibilityError(
        "expected another field after ','.",
        tokens[index - 1],
      );
    }
  }

  return fields;
}

function parseStructFields(
  tokens: Token[],
  opening: number,
  closing: number,
): SimpleStructField[] {
  const fields: SimpleStructField[] = [];
  let declarationStart = opening + 1;

  for (let index = opening + 1; index < closing; index += 1) {
    if (tokens[index].value === "{") {
      compatibilityError(
        "nested structs and method bodies are not supported.",
        tokens[index],
      );
    }
    if (tokens[index].value !== ";") continue;
    fields.push(
      ...parseMemberDeclaration(tokens.slice(declarationStart, index)),
    );
    declarationStart = index + 1;
  }

  if (declarationStart !== closing) {
    compatibilityError(
      "each field declaration must end with ';'.",
      tokens[declarationStart],
    );
  }

  const names = new Set<string>();
  for (const field of fields) {
    if (names.has(field.name)) {
      compatibilityError(
        `field '${field.name}' is declared more than once.`,
        tokens[opening],
      );
    }
    names.add(field.name);
  }

  return fields;
}

function makeInclude(
  definitions: SimpleStructDefinition[],
): ArduinoIncludeModule {
  return {
    load(runtime: JscppRuntime) {
      for (const definition of definitions) {
        const members = definition.fields.map((field) => {
          let type = runtime.simpleType(field.type);
          for (
            let index = field.dimensions.length - 1;
            index >= 0;
            index -= 1
          ) {
            type = runtime.arrayPointerType(type, field.dimensions[index]);
          }
          return { name: field.name, type };
        });
        const type = runtime.newClass(`struct ${definition.name}`, members);
        runtime.registerTypedef(type, definition.name);
      }
    },
  };
}

function blankRange(source: string, start: number, end: number): string {
  return source.slice(start, end).replace(/[^\r\n]/g, " ");
}

function newlineCount(value: string): number {
  return (value.match(/\n/g) ?? []).length;
}

function defaultInitializer(field: SimpleStructField): string {
  if (field.type === "String") return '""';
  if (field.type === "bool") return "false";
  return "0";
}

interface AggregateInitializer {
  closing: number;
  semicolon: number;
  expressions: string[];
}

function parseAggregateInitializer(
  source: string,
  tokens: Token[],
  opening: number,
): AggregateInitializer {
  const expressions: string[] = [];
  let expressionStart = opening + 1;
  let nesting = 0;

  for (let index = opening + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.value === "(" || token.value === "[" || token.value === "{") {
      nesting += 1;
      continue;
    }
    if (token.value === ")" || token.value === "]") {
      nesting -= 1;
      if (nesting < 0)
        compatibilityError("malformed aggregate initializer.", token);
      continue;
    }
    if (token.value === "}" && nesting > 0) {
      nesting -= 1;
      continue;
    }

    const atSeparator = token.value === "," && nesting === 0;
    const atClosing = token.value === "}" && nesting === 0;
    if (!atSeparator && !atClosing) continue;

    if (expressionStart < index) {
      expressions.push(
        source.slice(tokens[expressionStart].start, tokens[index - 1].end),
      );
    } else if (atSeparator) {
      compatibilityError(
        "aggregate initializer entries cannot be empty.",
        token,
      );
    }

    if (atClosing) {
      const semicolon = tokens[index + 1];
      if (semicolon?.value !== ";") {
        compatibilityError(
          "declare one initialized struct variable per statement.",
          semicolon ?? token,
        );
      }
      return { closing: index, semicolon: index + 1, expressions };
    }
    expressionStart = index + 1;
  }

  compatibilityError(
    "aggregate initializer is missing its closing '}'.",
    tokens[opening],
  );
}

function lowerAggregateInitializer(
  source: string,
  tokens: Token[],
  typeStart: number,
  variableIndex: number,
  opening: number,
  definition: SimpleStructDefinition,
): { start: number; end: number; text: string; semicolon: number } {
  const aggregate = parseAggregateInitializer(source, tokens, opening);
  const variable = tokens[variableIndex];

  if (aggregate.expressions.length > definition.fields.length) {
    compatibilityError(
      `struct '${definition.name}' has ${definition.fields.length} fields but the initializer has ${aggregate.expressions.length} values.`,
      tokens[opening],
    );
  }
  const arrayField = definition.fields.find(
    (field) => field.dimensions.length > 0,
  );
  if (arrayField) {
    compatibilityError(
      `aggregate initialization of array field '${arrayField.name}' is not supported.`,
      tokens[opening],
    );
  }

  let text = `${source.slice(tokens[typeStart].start, variable.end)};`;
  for (let index = 0; index < definition.fields.length; index += 1) {
    const field = definition.fields[index];
    const value = aggregate.expressions[index] ?? defaultInitializer(field);
    text += `${variable.value}.${field.name}=${value};`;
  }

  const start = tokens[typeStart].start;
  const end = tokens[aggregate.semicolon].end;
  const missingNewlines =
    newlineCount(source.slice(start, end)) - newlineCount(text);
  text += "\n".repeat(Math.max(0, missingNewlines));
  return { start, end, text, semicolon: aggregate.semicolon };
}

export function prepareSimpleStructs(source: string): PreparedSimpleStructs {
  const tokens = tokenize(source);
  const definitions: SimpleStructDefinition[] = [];
  const replacements: Array<{ start: number; end: number; text: string }> = [];
  const names = new Set<string>();
  let braceDepth = 0;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.value === "typedef" && tokens[index + 1]?.value === "struct") {
      compatibilityError(
        "typedef and anonymous struct forms are not supported.",
        token,
      );
    }
    if (token.value === "struct" && tokens[index + 1]?.value === "{") {
      compatibilityError(
        "anonymous and typedef struct forms are not supported.",
        token,
      );
    }
    if (
      token.value === "struct" &&
      tokens[index + 1]?.kind === "identifier" &&
      tokens[index + 2]?.value === ":"
    ) {
      compatibilityError("inheritance is not supported.", token);
    }
    if (
      token.value === "struct" &&
      tokens[index + 1]?.kind === "identifier" &&
      tokens[index + 2]?.value === ";"
    ) {
      compatibilityError("forward declarations are not supported.", token);
    }
    if (
      token.value === "struct" &&
      tokens[index + 1]?.kind === "identifier" &&
      tokens[index + 2]?.value === "{"
    ) {
      if (braceDepth !== 0) {
        compatibilityError("struct definitions must be at file scope.", token);
      }
      if (tokens[index - 1]?.value === "typedef") {
        compatibilityError(
          "typedef and anonymous struct forms are not supported.",
          token,
        );
      }

      const name = tokens[index + 1].value;
      let closing = index + 3;
      let nestedDepth = 1;
      for (; closing < tokens.length && nestedDepth > 0; closing += 1) {
        if (tokens[closing].value === "{") nestedDepth += 1;
        if (tokens[closing].value === "}") nestedDepth -= 1;
      }
      if (nestedDepth !== 0) {
        compatibilityError(
          `struct '${name}' is missing its closing '}'.`,
          token,
        );
      }
      closing -= 1;

      const semicolon = tokens[closing + 1];
      if (semicolon?.value !== ";") {
        compatibilityError(
          "declare variables after the struct definition and end the definition with ';'.",
          semicolon ?? tokens[closing],
        );
      }
      if (names.has(name)) {
        compatibilityError(
          `struct '${name}' is defined more than once.`,
          token,
        );
      }

      definitions.push({
        name,
        fields: parseStructFields(tokens, index + 2, closing),
      });
      names.add(name);
      replacements.push({
        start: token.start,
        end: semicolon.end,
        text: blankRange(source, token.start, semicolon.end),
      });
      index = closing + 1;
      continue;
    }

    if (token.value === "{") braceDepth += 1;
    if (token.value === "}") braceDepth = Math.max(0, braceDepth - 1);
  }

  if (definitions.length === 0) return { source };

  const definitionsByName = new Map(
    definitions.map((definition) => [definition.name, definition]),
  );
  const insideDefinition = (token: Token): boolean =>
    replacements.some(
      (replacement) =>
        token.start >= replacement.start && token.end <= replacement.end,
    );
  let aggregateBraceDepth = 0;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (insideDefinition(token)) continue;

    const directDefinition = definitionsByName.get(token.value);
    const directType =
      directDefinition && tokens[index + 1]?.kind === "identifier";
    const taggedDefinition =
      token.value === "struct"
        ? definitionsByName.get(tokens[index + 1]?.value)
        : undefined;
    const taggedType =
      taggedDefinition && tokens[index + 2]?.kind === "identifier";
    const equals = tokens[index + (taggedType ? 3 : 2)];
    if ((directType || taggedType) && equals?.value === "=") {
      if (tokens[index + (taggedType ? 4 : 3)]?.value !== "{") {
        compatibilityError("copy initialization is not supported.", equals);
      }
      if (aggregateBraceDepth === 0) {
        compatibilityError(
          "aggregate initialization is currently supported only inside functions.",
          equals,
        );
      }

      const lowered = lowerAggregateInitializer(
        source,
        tokens,
        index,
        index + (taggedType ? 2 : 1),
        index + (taggedType ? 4 : 3),
        (taggedDefinition ?? directDefinition)!,
      );
      replacements.push({
        start: lowered.start,
        end: lowered.end,
        text: lowered.text,
      });
      index = lowered.semicolon;
      continue;
    }

    if (token.value === "{") aggregateBraceDepth += 1;
    if (token.value === "}")
      aggregateBraceDepth = Math.max(0, aggregateBraceDepth - 1);
  }

  replacements.sort((left, right) => left.start - right.start);
  let transformed = "";
  let position = 0;
  for (const replacement of replacements) {
    transformed += source.slice(position, replacement.start);
    transformed += replacement.text;
    position = replacement.end;
  }
  transformed += source.slice(position);

  return { source: transformed, include: makeInclude(definitions) };
}
