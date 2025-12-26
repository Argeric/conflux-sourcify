import { AbstractCompilation } from "@ethereum-sourcify/lib-sourcify/build/main/Compilation/AbstractCompilation";
import { CompilationError, SolidityOutputContract } from "@ethereum-sourcify/lib-sourcify";
import { logWarn } from "@ethereum-sourcify/compilers/build/main/logger";
import { VyperOutputContract } from "@ethereum-sourcify/compilers-types";

export abstract class ExtendedAbsCompilation extends AbstractCompilation {

  get contractCompilerOutput(): SolidityOutputContract | VyperOutputContract {
    if (!this.compilerOutput) {
      logWarn("Compiler output is undefined");
      throw new CompilationError({ code: "no_compiler_output" });
    }

    this.setCompilationTargetIfMissing(this.compilerOutput.contracts);

    if (
      !this.compilerOutput.contracts ||
      !this.compilerOutput.contracts[this.compilationTarget.path] ||
      !this.compilerOutput.contracts[this.compilationTarget.path][
        this.compilationTarget.name
        ]
    ) {
      logWarn("Contract not found in compiler output");
      throw new CompilationError({
        code: "contract_not_found_in_compiler_output"
      });
    }

    return this.compilerOutput.contracts[this.compilationTarget.path][
      this.compilationTarget.name
      ];
  }

  private setCompilationTargetIfMissing(outputContracts: {
    [path: string]: {
      [name: string]: SolidityOutputContract | VyperOutputContract
    }
  }) {
    if (
      this.compilationTarget.name ||
      !outputContracts ||
      !Object.keys(outputContracts).length
    ) {
      return;
    }

    let max = -Infinity;
    let contractPath = null;
    let contractName = null;

    for (const [path, contracts] of Object.entries(outputContracts)) {
      for (const [name, contract] of Object.entries(contracts)) {
        const len = contract.evm.bytecode.object.length;
        if (len > max) {
          max = len;
          contractPath = path;
          contractName = name;
        }
      }
    }

    if (contractPath !== null && contractName !== null) {
      this.compilationTarget.path = contractPath;
      this.compilationTarget.name = contractName;
    }
    console.log(`Set compilation target if missing`, {contractPath, contractName});
  }
}