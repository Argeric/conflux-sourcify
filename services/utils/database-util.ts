export function getCompilerNameFromLanguage(language: string): string {
  switch (language.toLocaleLowerCase()) {
    case "yul":
    case "solidity":
      return "solc";
    case "vyper":
      return "vyper";
    case "fe":
      return "fe";
    default:
      throw new Error("Language not supported");
  }
}