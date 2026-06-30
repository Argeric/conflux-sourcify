import { SolidityCompilation } from "./SolidityCompilation";
import { VyperCompilation } from "./VyperCompilation";
import { FeCompilation } from "./FeCompilation";

export type AnyCompilation =
  | SolidityCompilation
  | VyperCompilation
  | FeCompilation;
