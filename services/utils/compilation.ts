import {
  CompilationTarget,
  ISolidityCompiler,
  IVyperCompiler,
} from '@ethereum-sourcify/lib-sourcify';
import {
  CompilationError,
} from "@ethereum-sourcify/lib-sourcify";
import type {
  AnyJsonInput,
  SolidityJsonInput,
  VyperJsonInput,
} from "@ethereum-sourcify/compilers-types";
import { AnyCompilation } from '../compilation/CompilationTypes';
import { SolidityCompilation } from '../compilation/SolidityCompilation';
import { VyperCompilation } from '../compilation/VyperCompilation';
import { YulCompilation } from '../compilation/YulCompilation';

export function createCompilationFromJsonInput(
  compilers: {
    solc: ISolidityCompiler;
    vyper: IVyperCompiler;
  },
  compilerVersion: string,
  jsonInput: AnyJsonInput,
  compilationTarget: CompilationTarget,
): AnyCompilation {
  switch (jsonInput?.language) {
    case "Solidity": {
      return new SolidityCompilation(
        compilers.solc,
        compilerVersion,
        jsonInput as SolidityJsonInput,
        compilationTarget,
      );
    }
    case "Yul": {
      return new YulCompilation(
        compilers.solc,
        compilerVersion,
        jsonInput as SolidityJsonInput,
        compilationTarget,
      );
    }
    case "Vyper": {
      return new VyperCompilation(
        compilers.vyper,
        compilerVersion,
        jsonInput as VyperJsonInput,
        compilationTarget,
      );
    }
    default: {
      throw new CompilationError({ code: "invalid_language" });
    }
  }
}
