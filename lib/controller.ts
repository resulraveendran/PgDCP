import {
  colors,
  docopt,
  fmt,
  fs,
  govnSvcVersion as gsv,
  path,
  safety,
  textWhitespace as tw,
  uuid,
} from "./deps.ts";
import * as interp from "./interpolate.ts";
import * as dcp from "./dcp.ts";

export interface ExecutionContext {
  readonly calledFromMetaURL: string;
  readonly version?: string;
  readonly projectHome?: string;
}

export interface CliExecutionContext extends ExecutionContext {
  readonly cliArgs: docopt.DocOptions;
}

export const isCliExecutionContext = safety.typeGuard<CliExecutionContext>(
  "cliArgs",
);

export interface InteropolateOptions {
  readonly destHome?: string;
  readonly driverFileName?: string;
  readonly includeInDriver: (pir: PersistableInterpolationResult) => boolean;
}

export interface ControllerOptions {
  readonly projectHome: string;
  readonly transactionID: string;
  readonly isVerbose: boolean;
  readonly isDryRun: boolean;
  readonly buildHostID: string;

  readonly interpolate: () => InteropolateOptions;
  readonly mkDirs: (dirs: string) => void;
}

export function cliControllerOptions(
  ec: CliExecutionContext,
): ControllerOptions {
  const {
    "--project": projectArg,
    "--verbose": verboseArg,
    "--dry-run": dryRunArg,
    "--tx-id": transactionIdArg,
  } = ec.cliArgs;
  const projectHomeDefault = projectArg
    ? projectArg as string
    : (ec.projectHome || Deno.cwd());
  const projectHomeRel = path.isAbsolute(projectHomeDefault)
    ? path.relative(Deno.cwd(), projectHomeDefault)
    : projectHomeDefault;
  const projectHomeAbs = path.resolve(Deno.cwd(), projectHomeRel);
  const isDryRun = dryRunArg ? true : false;
  const isVerbose = isDryRun || (verboseArg ? true : false);
  const transactionID = transactionIdArg
    ? transactionIdArg.toString()
    : uuid.v4.generate();

  const ctlOptions: ControllerOptions = {
    projectHome: projectHomeAbs,
    transactionID,
    isDryRun,
    isVerbose,
    buildHostID: Deno.hostname(),
    mkDirs: (dirs: string) => {
      if (!fs.existsSync(dirs)) {
        if (isVerbose || isDryRun) {
          console.log(`mkdir -p ${colors.yellow(dirs)}`);
        }
        if (!isDryRun) {
          Deno.mkdirSync(dirs, { recursive: true });
        }
      }
    },
    interpolate: () => {
      const { "--dest": destHome, "--driver": driverFileName } = ec.cliArgs;
      const interpOptions: InteropolateOptions = {
        destHome: destHome ? destHome as string : undefined,
        driverFileName: driverFileName ? driverFileName as string : undefined,
        includeInDriver: () => {
          return true;
        },
      };
      if (interpOptions.destHome) ctlOptions.mkDirs(interpOptions.destHome);
      return interpOptions;
    },
  };
  return ctlOptions;
}

export interface PersistableInterpolationResult
  extends interp.InterpolationResult {
  readonly original: interp.InterpolatedContent;
  readonly indexedFileName: string;
}

export class ControllerInterpolationEngine
  implements interp.InterpolationEngine {
  #executionIndex = 0;
  readonly persistable: PersistableInterpolationResult[] = [];

  constructor(
    readonly version: string,
    readonly ctlOptions: ControllerOptions,
    readonly interpOptions: InteropolateOptions,
    readonly dcpSS: dcp.DataComputingPlatformSqlSupplier,
  ) {
  }

  prepareInterpolation(
    p: interp.TemplateProvenance,
  ): interp.InterpolationExecution {
    return {
      index: ++this.#executionIndex,
      stamp: new Date(),
    };
  }

  registerResult(
    interpolated: interp.InterpolatedContent,
    state: interp.InterpolationState,
    options: interp.InterpolationOptions,
  ): interp.InterpolationResult {
    const { provenance } = state;
    const decorated = `
    ${
      dcp.isInterpolationSchemaSupplier(state)
        ? `CREATE SCHEMA IF NOT EXISTS ${state.schema};`
        : "-- no InterpolationSchemaSupplier.schema supplied"
    }
    ${
      dcp.isInterpolationSchemaSearchPathSupplier(state)
        ? `SET search_path TO ${[state.searchPath].join(", ")};`
        : (state.provenance.identity == "engine.sql.ts"
          ? ""
          : `SET search_path TO ${this.dcpSS.schemaName.experimental}; -- ${this.dcpSS.schemaName.experimental} is used because no searchPath provided`)
    }
    ` + interpolated;
    if (interp.isEmbeddedInterpolationState(state)) {
      // the interpolated result is embedded into another parent so we don't
      // decorate it or store it separately
      return {
        engine: this,
        state,
        options,
        interpolated: `
        -- Embedded from: ${provenance.identity} (${provenance.source})
        -- version: ${provenance.version}
        ` + decorated,
      };
    }
    const indexedFileName = fmt.sprintf(
      path.join("%03d_%s.auto.sql"),
      state.execID.index,
      state.provenance.identity.replace(/\..+$/, ""),
    );
    const result: PersistableInterpolationResult = {
      engine: this,
      state,
      options,
      interpolated: tw.unindentWhitespace(`
      -- Code generated by PgDCP ${this.version}. DO NOT EDIT.
      -- source: ${provenance.identity} (${provenance.source})
      -- version: ${provenance.version}
      `) + decorated,
      original: interpolated,
      indexedFileName,
    };
    this.persistable.push(result);
    this.persistResult(result);
    return result;
  }

  persistResult(result: PersistableInterpolationResult) {
    if (this.interpOptions.destHome) {
      const fileName = path.join(
        this.interpOptions.destHome,
        result.indexedFileName,
      );
      if (this.ctlOptions.isVerbose || this.ctlOptions.isDryRun) {
        console.log(colors.yellow(fileName));
      }
      if (!this.ctlOptions.isDryRun) {
        Deno.writeTextFileSync(fileName, result.interpolated);
      }
    } else {
      console.log(result.interpolated);
    }
  }

  persistPostgreSqlDriver(): void {
    if (this.interpOptions.destHome && this.interpOptions.driverFileName) {
      const fileName = path.join(
        this.interpOptions.destHome,
        this.interpOptions.driverFileName,
      );
      if (this.ctlOptions.isVerbose || this.ctlOptions.isDryRun) {
        console.log(colors.yellow(fileName));
      }
      if (!this.ctlOptions.isDryRun) {
        const driver = this.persistable.map((pir) => {
          return tw.unindentWhitespace(`\\ir ${pir.indexedFileName}`);
        }).join("\n");
        Deno.writeTextFileSync(fileName, driver);
      }
    }
  }
}

export abstract class Controller {
  constructor(
    readonly ec: ExecutionContext,
    readonly options: ControllerOptions,
  ) {
  }

  async initController(): Promise<void> {
  }

  async finalizeController(): Promise<void> {
  }

  async interpolationEngine(
    interpOptions: InteropolateOptions,
    dcpSS = dcp.typicalDcpSqlSupplier(),
  ): Promise<ControllerInterpolationEngine> {
    return new ControllerInterpolationEngine(
      await this.determineVersion(),
      this.options,
      interpOptions,
      dcpSS,
    );
  }

  abstract interpolate(interpOptions: InteropolateOptions): Promise<void>;

  async handleCLI(): Promise<boolean> {
    if (!isCliExecutionContext(this.ec)) {
      throw Error("Expecting CLI execution environment");
    }
    const { cliArgs } = this.ec;

    const { "interpolate": interpolate } = cliArgs;
    if (interpolate) {
      await this.interpolate(this.options.interpolate());
      return true;
    }

    const { "version": version } = cliArgs;
    if (version) {
      console.log(
        `PgDCP Controller ${
          colors.yellow(await this.determineVersion(import.meta.url))
        }`,
      );
      return true;
    }

    return false;
  }

  async determineVersion(
    importMetaURL: string = import.meta.url,
  ): Promise<string> {
    return this.ec.version || await gsv.determineVersionFromRepoTag(
      importMetaURL,
      { repoIdentity: "PgDCP" },
    );
  }
}

export function cliArgs(caller: ExecutionContext): CliExecutionContext {
  const docOptSpec = tw.unindentWhitespace(`
    PgDCP Controller ${caller.version}.

    Usage:
    dcpctl interpolate [--dest=<dest-home>] [--driver=<driver-file>] [--dry-run] [--verbose]
    dcpctl version
    dcpctl -h | --help

    Options:
    --dest=<dest-home>      Path where destination file(s) should be stored (STDOUT otherwise)
    --driver=<driver-file>  The name of the PostgreSQL driver file to create [default: driver.psql]
    --dry-run               Show what will be done (but don't actually do it) [default: false]
    --verbose               Be explicit about what's going on [default: false]
    -h --help               Show this screen
  `);
  return {
    ...caller,
    cliArgs: docopt.default(docOptSpec),
  };
}

export async function CLI(ctl: Controller): Promise<void> {
  try {
    await ctl.initController();
    if (!ctl.handleCLI()) {
      console.error("Unable to handle validly parsed docoptSpec:");
      console.dir(cliArgs);
    }
    await ctl.finalizeController();
  } catch (e) {
    console.error(e.message);
  }
}

// if (import.meta.main) {
//   dotenv.config({ safe: true, export: true });
//   const cliEC = cliArgs({
//     calledFromMetaURL: import.meta.url,
//   });
//   await CLI(new Controller(cliEC, cliControllerOptions(cliEC)));
// }
