// Tools to assemble SolidityMetadataContract(s) from files.

import { Sources, SolidityJsonInput } from "@ethereum-sourcify/compilers-types";
import {
  PathBuffer,
  PathContent,
  splitFiles,
  StringMap,
  unzipFiles,
} from "@ethereum-sourcify/lib-sourcify";
import { SolidityCompilation } from "../compilation/SolidityCompilation";

export async function useAllSourcesAndReturnCompilation(
  solidityCompilation: SolidityCompilation,
  files: PathBuffer[],
) {
  await unzipFiles(files);
  const parsedFiles = files.map((pathBuffer) => ({
    content: pathBuffer.buffer.toString(),
    path: pathBuffer.path,
  }));
  const { sourceFiles } = splitFiles(parsedFiles);
  const stringMapSourceFiles = pathContentArrayToStringMap(sourceFiles);

  // Create a proper Sources object from the StringMap
  const sourcesObject: Sources = {};

  // First add all sources from the string map
  for (const path in stringMapSourceFiles) {
    sourcesObject[path] = {
      content: stringMapSourceFiles[path],
    };
  }

  // Then add all sources from the solidityCompilation (which are already hash matched)
  // These will override any duplicates from the string map
  for (const path in solidityCompilation.jsonInput.sources) {
    sourcesObject[path] = solidityCompilation.jsonInput.sources[path];
  }

  // Create a new SolidityJsonInput with the combined sources
  const newJsonInput: SolidityJsonInput = {
    language: solidityCompilation.jsonInput.language,
    sources: sourcesObject,
    settings: solidityCompilation.jsonInput.settings,
  };

  const solidityCompilationWithAllSources = new SolidityCompilation(
    solidityCompilation.compiler,
    solidityCompilation.compilerVersion,
    newJsonInput,
    solidityCompilation.compilationTarget,
  );
  return solidityCompilationWithAllSources;
}

function pathContentArrayToStringMap(pathContentArr: PathContent[]) {
  const stringMapResult: StringMap = {};
  pathContentArr.forEach((elem, i) => {
    if (elem.path) {
      stringMapResult[elem.path] = elem.content;
    } else {
      stringMapResult[`path-${i}`] = elem.content;
    }
  });
  return stringMapResult;
}
