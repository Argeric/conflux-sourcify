export function getCompilerNameFromLanguage(language: string): string {
  switch (language.toLocaleLowerCase()) {
    case "yul":
    case "solidity":
      return "solc";
    case "vyper":
      return "vyper";
    default:
      throw new Error("Language not supported");
  }
}