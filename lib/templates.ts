import { textWhitespace as tw } from "./deps.ts";
import * as iSQL from "./interpolate-sql.ts";
import * as schemas from "./schemas.ts";

export const preface: iSQL.DcpTemplateSupplier = (state) => {
  const { provenance } = state.ie;
  return tw.unindentWhitespace(`
      -- Code generated by PgDCP ${state.ic.engine.version}. DO NOT EDIT.
      -- source: ${provenance.identity} (${
    provenance.humanReadableSource(provenance)
  })
      -- version: ${provenance.version}`);
};

export const embeddedPreface: iSQL.DcpTemplateSupplier = (state) => {
  const { provenance } = state.ie;
  return tw.unindentWhitespace(`
      -- embedded from: ${provenance.identity} (${
    provenance.humanReadableSource(provenance)
  })
      -- version: ${provenance.version}`);
};

export const schema: iSQL.DcpTemplateSupplier = (state) => {
  return `${state.schema.createSchemaSql(state)};`;
};

export const extensions: iSQL.DcpTemplateSupplier = (state) => {
  return state.extensions
    ? (state.extensions.map((e) => `${e.createSql(state)};`).join("\n"))
    : "-- no extensions required";
};

export const searchPath: iSQL.DcpTemplateSupplier = (state) => {
  return state.searchPath
    ? `SET search_path TO ${
      [...new Set(state.searchPath.map((s) => s.name))].join(", ")
    };` // only unique schemas in search path
    : `SET search_path TO ${schemas.experimental}; -- ${schemas.experimental} is used because no searchPath provided`;
};
