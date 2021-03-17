import { safety, textWhitespace as tw } from "./deps.ts";

export interface TemplateProvenance {
  readonly identity: string;
  readonly version: string;
  readonly source: string;
}

export interface TypeScriptModuleProvenance extends TemplateProvenance {
  readonly importMetaURL: string;
}

export interface InterpolationExecution {
  readonly index: number;
  readonly stamp: Date;
}

export type InterpolatedContent = string;

export interface InterpolationEngine {
  readonly version: string;
  readonly prepareInterpolation: (
    p: TemplateProvenance,
  ) => InterpolationExecution;
  readonly registerResult: (
    interpolated: InterpolatedContent,
    state: InterpolationState,
    options: InterpolationOptions,
  ) => InterpolationResult;
}

export interface InterpolationState {
  readonly provenance: TemplateProvenance;
  readonly execID: InterpolationExecution;
}

export interface EmbeddedInterpolationState extends InterpolationState {
  readonly parent: InterpolationState;
}

export const isEmbeddedInterpolationState = safety.typeGuard<
  EmbeddedInterpolationState
>("provenance", "execID", "parent");

export interface InterpolationOptions {
  readonly unindent: boolean;
}

export interface InterpolationResult {
  readonly engine: InterpolationEngine;
  readonly state: InterpolationState;
  readonly options: InterpolationOptions;
  readonly interpolated: string;
}

export interface TemplateLiteral {
  (
    literals: TemplateStringsArray,
    ...expressions: unknown[]
  ): InterpolationResult;
}

export interface TemplateSupplier {
  (
    ctx: InterpolationEngine,
    state: InterpolationState,
  ): TemplateLiteral;
}

/**
 * Creates a template tag which can be "executed" in the given context with a 
 * local state. 
 * @param engine is the context that all templates can use across invocations
 * @param state is the "local" state of a single interpolation
 * @returns the interpolated template text
 */
export function executeTemplate(
  engine: InterpolationEngine,
  state: InterpolationState,
  options: InterpolationOptions,
): TemplateLiteral {
  return (literals: TemplateStringsArray, ...expressions: unknown[]) => {
    let interpolated = "";
    for (let i = 0; i < expressions.length; i++) {
      interpolated += literals[i];
      interpolated += expressions[i];
    }
    interpolated += literals[literals.length - 1];
    if (options.unindent) {
      interpolated = tw.unindentWhitespace(interpolated);
    }
    return engine.registerResult(interpolated, state, options);
  };
}

/**
 * Creates a SQL template tag which can be "executed" in the given context 
 * with a local state. The special 'SQL' name is used by some Visual Studio
 * Code extensions to do code highlighting and error detection inside template
 * literal so it's worth creating a wrapper around executeTemplate which is
 * generic.
 * @param engine is the context that all templates can use across invocations
 * @param state is the "local" state of a single interpolation
 * @returns the interpolated template text
 */
export function SQL(
  engine: InterpolationEngine,
  state: InterpolationState,
  options: InterpolationOptions,
): TemplateLiteral {
  return executeTemplate(engine, state, options);
}
