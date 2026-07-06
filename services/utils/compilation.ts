import {
  CompilationTarget,
  ISolidityCompiler,
  IVyperCompiler,
  IFeCompiler,
} from '@ethereum-sourcify/lib-sourcify';
import {
  CompilationError,
} from "@ethereum-sourcify/lib-sourcify";
import type {
  AnyJsonInput,
  SolidityJsonInput,
  VyperJsonInput,
  FeJsonInput,
} from "@ethereum-sourcify/compilers-types";
import { AnyCompilation } from '../compilation/CompilationTypes';
import { SolidityCompilation } from '../compilation/SolidityCompilation';
import { VyperCompilation } from '../compilation/VyperCompilation';
import { YulCompilation } from '../compilation/YulCompilation';
import { FeCompilation } from '../compilation/FeCompilation';

export function createCompilationFromJsonInput(
  compilers: {
    solc: ISolidityCompiler;
    vyper: IVyperCompiler;
    fe: IFeCompiler;
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
    case "Fe": {
      return new FeCompilation(
        compilers.fe,
        compilerVersion,
        jsonInput as FeJsonInput,
        compilationTarget,
      );
    }
    default: {
      throw new CompilationError({ code: "invalid_language" });
    }
  }
}
