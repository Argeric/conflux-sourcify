import { AuxdataStyle } from "@ethereum-sourcify/bytecode-utils";
import {
  CompilationTarget,
  CompiledContractCborAuxdata,
  CompilationLanguage,
  StringMap,
  CompilationError,
  ISolidityCompiler,
  IVyperCompiler,
} from "@ethereum-sourcify/lib-sourcify";
import {
  ImmutableReferences,
  SolidityJsonInput,
  SolidityOutput,
  SolidityOutputContract,
  LinkReferences,
  Metadata,
  VyperJsonInput,
  VyperOutput,
  VyperOutputContract,
} from "@ethereum-sourcify/compilers-types";
import {
  logInfo,
  logSilly,
  logWarn,
} from "@ethereum-sourcify/compilers/build/main/logger";

export abstract class AbstractCompilation {
  /**
   * Constructor parameters
   */
  abstract compiler: ISolidityCompiler | IVyperCompiler;
  abstract compilerVersion: string;
  abstract compilationTarget: CompilationTarget;
  jsonInput: SolidityJsonInput | VyperJsonInput;

  protected _metadata?: Metadata;
  compilerOutput?: SolidityOutput | VyperOutput;
  compilationTime?: number;

  abstract auxdataStyle: AuxdataStyle;
  abstract language: CompilationLanguage;

  /** Marks the positions of the CborAuxdata parts in the bytecode */
  protected _creationBytecodeCborAuxdata?: CompiledContractCborAuxdata;
  protected _runtimeBytecodeCborAuxdata?: CompiledContractCborAuxdata;

  /**
   * Recompiles the contract with the specified compiler settings
   * @param forceEmscripten Whether to force using the WebAssembly binary for compilation (only for Solidity)
   */
  abstract compile(forceEmscripten?: boolean): Promise<void>;
  abstract generateCborAuxdataPositions(
    forceEmscripten?: boolean,
  ): Promise<void>;

  constructor(jsonInput: SolidityJsonInput | VyperJsonInput) {
    this.jsonInput = structuredClone(jsonInput);
  }

  public async compileAndReturnCompilationTarget(
    forceEmscripten = false,
  ): Promise<SolidityOutputContract | VyperOutputContract> {
    const version = this.compilerVersion;

    const compilationStartTime = Date.now();
    logInfo("Compiling contract", {
      version,
      contract: this.compilationTarget.name,
      path: this.compilationTarget.path,
      forceEmscripten,
    });
    logSilly("Compilation input", { solcJsonInput: this.jsonInput });
    try {
      if (!this.compilerOutput) {
        // compile once
        this.compilerOutput = await this.compiler.compile(
          version,
          this.jsonInput as any,
          forceEmscripten,
        );
      }
    } catch (e: any) {
      logWarn("Compiler error", {
        error: e.message,
      });
      throw new CompilationError({ code: "compiler_error" });
    }

    if (this.compilerOutput === undefined) {
      logWarn("Compiler error: compilerOutput is undefined");
      throw new CompilationError({ code: "no_compiler_output" });
    }

    // We call contractCompilerOutput() before logging because it can throw an error
    const compilationTargetContract = this.contractCompilerOutput;

    const compilationEndTime = Date.now();
    this.compilationTime = compilationEndTime - compilationStartTime;
    logSilly("Compilation output", { compilerOutput: this.compilerOutput });
    logInfo("Compiled contract", {
      version,
      contract: this.compilationTarget.name,
      path: this.compilationTarget.path,
      forceEmscripten,
      compilationDuration: `${this.compilationTime}ms`,
    });

    return compilationTargetContract;
  }

  public async compileAndReturnContractFullQualifyNames(
    forceEmscripten = false,
  ): Promise<{ path: string; name: string }[]> {
    const version = this.compilerVersion;

    console.info("Compiling contract", { version, forceEmscripten });
    const compilationStartTime = Date.now();
    try {
      this.compilerOutput = await this.compiler.compile(
        version,
        this.jsonInput as any,
        forceEmscripten,
      );
    } catch (e: any) {
      console.warn("Compiler error", { error: e.message });
      throw new CompilationError({ code: "compiler_error" });
    }

    const contractFullQualifyNames = this.contractFullQualifyNames;

    this.compilationTime = Date.now() - compilationStartTime;
    console.info("Compiled contract", {
      version,
      forceEmscripten,
      compilationDuration: `${this.compilationTime}ms`,
    });

    return contractFullQualifyNames;
  }

  get contractCompilerOutput(): SolidityOutputContract | VyperOutputContract {
    if (!this.compilerOutput) {
      logWarn("Compiler output is undefined");
      throw new CompilationError({ code: "no_compiler_output" });
    }
    if (
      !this.compilerOutput.contracts ||
      !this.compilerOutput.contracts[this.compilationTarget.path] ||
      !this.compilerOutput.contracts[this.compilationTarget.path][
        this.compilationTarget.name
      ]
    ) {
      logWarn("Contract not found in compiler output");
      throw new CompilationError({
        code: "contract_not_found_in_compiler_output",
      });
    }
    return this.compilerOutput.contracts[this.compilationTarget.path][
      this.compilationTarget.name
    ];
  }

  get contractFullQualifyNames(): { path: string; name: string }[] {
    if (!this.compilerOutput) {
      console.warn("Compiler output is undefined");
      throw new CompilationError({ code: "no_compiler_output" });
    }

    if (
      !this.compilerOutput.contracts ||
      !Object.keys(this.compilerOutput.contracts).length
    ) {
      console.warn("Contract not found in compiler output");
      throw new CompilationError({
        code: "contract_not_found_in_compiler_output",
      });
    }

    const outputContracts: {
      [sourcePath: string]: {
        [contractName: string]: SolidityOutputContract | VyperOutputContract;
      };
    } = this.compilerOutput.contracts;

    const candidates: { path: string; name: string }[] = [];
    for (const [path, contracts] of Object.entries(outputContracts)) {
      for (const [name, contract] of Object.entries(contracts)) {
        if (contract.evm.bytecode.object.length) {
          candidates.push({ path, name });
        }
      }
    }

    return candidates;
  }

  get creationBytecode() {
    return `0x${this.contractCompilerOutput.evm.bytecode.object}`;
  }

  get runtimeBytecode() {
    return `0x${this.contractCompilerOutput.evm.deployedBytecode.object}`;
  }

  get metadata() {
    if (!this._metadata) {
      throw new CompilationError({ code: "metadata_not_set" });
    }
    return this._metadata;
  }

  get sources() {
    return Object.keys(this.jsonInput.sources).reduce((acc, source) => {
      acc[source] = this.jsonInput.sources[source].content;
      return acc;
    }, {} as StringMap);
  }

  abstract get immutableReferences(): ImmutableReferences;
  abstract get runtimeLinkReferences(): LinkReferences;
  abstract get creationLinkReferences(): LinkReferences;

  get creationBytecodeCborAuxdata(): CompiledContractCborAuxdata {
    if (!this._creationBytecodeCborAuxdata) {
      throw new CompilationError({
        code: "creation_bytecode_cbor_auxdata_not_set",
      });
    }
    return this._creationBytecodeCborAuxdata;
  }

  get runtimeBytecodeCborAuxdata(): CompiledContractCborAuxdata {
    if (!this._runtimeBytecodeCborAuxdata) {
      throw new CompilationError({
        code: "runtime_bytecode_cbor_auxdata_not_set",
      });
    }
    return this._runtimeBytecodeCborAuxdata;
  }
}
