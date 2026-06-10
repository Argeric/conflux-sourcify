import type {
  SolidityJsonInput,
  SolidityOutput,
  VyperJsonInput,
  VyperOutput,
  FeJsonInput,
  FeOutput,
} from '@ethereum-sourcify/compilers-types';

import type { SolidityCompilation } from './SolidityCompilation';
import type { VyperCompilation } from './VyperCompilation';
import { FeCompilation } from "./FeCompilation";

export interface CompilationTarget {
  name: string;
  path: string;
}

export type CompilationLanguage = 'Solidity' | 'Vyper' | 'Yul' | 'Fe';

export interface ISolidityCompiler {
  compile(
    version: string,
    solcJsonInput: SolidityJsonInput,
    forceEmscripten?: boolean,
  ): Promise<SolidityOutput>;
}

export interface IVyperCompiler {
  compile(
    version: string,
    vyperJsonInput: VyperJsonInput,
  ): Promise<VyperOutput>;
}

export interface IFeCompiler {
  compile(version: string, feJsonInput: FeJsonInput): Promise<FeOutput>;
}

export type AnyCompilation =
  | SolidityCompilation
  | VyperCompilation
  | FeCompilation;
